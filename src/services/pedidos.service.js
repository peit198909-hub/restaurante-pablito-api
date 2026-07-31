import { db } from "../db/client.js";
import { calcularTotales } from "../utils/precios.js";
import { orderEvents } from "../utils/orderEvents.js";
import { obtenerConfiguracion, estaAbierto } from "./configuracion.service.js";

// Tabla de transiciones de estado permitidas para asegurar coherencia en el flujo
const TRANSICIONES_PERMITIDAS = {
  pendiente: ["confirmado", "cancelado"],
  confirmado: ["en_preparacion", "cancelado"],
  en_preparacion: ["listo", "cancelado"],
  listo: ["en_camino", "entregado", "cancelado"],
  en_camino: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

// 1. Crear un pedido con calculo estricto del servidor y validaciones
export async function crearPedido({ usuario_id, items, direccion_entrega, telefono_contacto, notas, metodo_pago, distancia_km = 0 }) {
  // 0. Validar horario de atención del restaurante
  const config = await obtenerConfiguracion();
  if (!estaAbierto(config)) {
    return {
      errorStatus: 400,
      message: `El restaurante se encuentra cerrado en este momento. Horario de atención: ${config.hora_apertura} a ${config.hora_cierre} (${config.dias_atencion}).`,
    };
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return { errorStatus: 400, message: "El carrito de compras no puede estar vacio" };
  }

  // 1. Validar cada item y obtener precio real de la BD
  const itemsProcesados = [];
  for (const item of items) {
    const prodRes = await db.execute({
      sql: "SELECT id, nombre, precio, disponible FROM productos WHERE id = ? LIMIT 1",
      args: [item.producto_id],
    });
    
    const producto = prodRes.rows[0];
    if (!producto) {
      return { errorStatus: 404, message: `El producto con ID ${item.producto_id} no existe` };
    }

    if (producto.disponible !== 1) {
      return { errorStatus: 409, message: `El producto "${producto.nombre}" ya no esta disponible` };
    }

    const cantidad = parseInt(item.cantidad, 10);
    if (isNaN(cantidad) || cantidad <= 0) {
      return { errorStatus: 422, message: `La cantidad para "${producto.nombre}" debe ser mayor a 0` };
    }

    const precioUnitario = parseFloat(producto.precio);
    const subtotalLinea = Math.round(precioUnitario * cantidad * 100) / 100;

    itemsProcesados.push({
      producto_id: producto.id,
      nombre: producto.nombre,
      precio_unitario: precioUnitario,
      cantidad,
      subtotal: subtotalLinea,
      notas: item.notas || null,
    });
  }

  // 2. Obtener direccion de entrega del perfil si no fue enviada
  let direccionFinal = direccion_entrega ? direccion_entrega.trim() : "";
  let telefonoFinal = telefono_contacto ? telefono_contacto.trim() : "";

  if (!direccionFinal || !telefonoFinal) {
    const usrRes = await db.execute({
      sql: "SELECT direccion, telefono FROM usuarios WHERE id = ? LIMIT 1",
      args: [usuario_id],
    });
    const usr = usrRes.rows[0];
    if (usr) {
      if (!direccionFinal) direccionFinal = usr.direccion || "";
      if (!telefonoFinal) telefonoFinal = usr.telefono || "";
    }
  }

  if (!direccionFinal) {
    return { errorStatus: 422, message: "Debe proporcionar una direccion de entrega para el pedido" };
  }

  // 3. Recalcular totales en el servidor
  const totales = calcularTotales(
    itemsProcesados.map((i) => ({ precio: i.precio_unitario, cantidad: i.cantidad }))
  );

  // 4. Calcular costo de envío por distancia (KM)
  const distKm = Math.max(0, parseFloat(distancia_km || 0));
  let costoEnvio = 0;
  if (distKm > 0) {
    if (distKm > config.distancia_maxima_km) {
      return {
        errorStatus: 422,
        message: `La distancia de envío (${distKm} km) supera el límite máximo del local (${config.distancia_maxima_km} km).`,
      };
    }
    costoEnvio = Math.round((config.costo_base_envio + (distKm * config.precio_por_km)) * 100) / 100;
  }

  const totalFinal = Math.round((totales.subtotal + totales.impuesto + costoEnvio) * 100) / 100;
  const metodoPagoFinal = ["efectivo", "transferencia", "otro"].includes(metodo_pago) ? metodo_pago : "efectivo";

  // 5. Insercion en base de datos
  // Insertar encabezado de pedido con costo_envio y distancia_km
  const insertPedidoRes = await db.execute({
    sql: `INSERT INTO pedidos (usuario_id, direccion_entrega, telefono_contacto, notas, estado, subtotal, impuesto, costo_envio, distancia_km, total, metodo_pago, creado_en)
          VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
          RETURNING *`,
    args: [
      usuario_id,
      direccionFinal,
      telefonoFinal || null,
      notas || null,
      totales.subtotal,
      totales.impuesto,
      costoEnvio,
      distKm,
      totalFinal,
      metodoPagoFinal,
    ],
  });

  const nuevoPedido = insertPedidoRes.rows[0];

  // Insertar cada item en detalles_pedidos
  const detallesGuardados = [];
  for (const item of itemsProcesados) {
    const detRes = await db.execute({
      sql: `INSERT INTO detalles_pedidos (pedido_id, producto_id, cantidad, precio_unitario, subtotal, notas)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING *`,
      args: [nuevoPedido.id, item.producto_id, item.cantidad, item.precio_unitario, item.subtotal, item.notas],
    });
    detallesGuardados.push({
      ...detRes.rows[0],
      producto_nombre: item.nombre,
    });
  }

  // Emitir evento SSE de creacion de pedido
  orderEvents.emit("pedido_actualizado", {
    tipo: "creado",
    pedido_id: nuevoPedido.id,
    usuario_id: nuevoPedido.usuario_id,
    estado: nuevoPedido.estado,
    total: nuevoPedido.total,
    pedido: nuevoPedido,
  });

  return {
    pedido: nuevoPedido,
    items: detallesGuardados,
  };
}

// 2. Obtener historial de pedidos de un cliente con paginacion opcional
export async function obtenerPedidosCliente(usuario_id, page = null, limit = null) {
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (pageNum > 0 && limitNum > 0) {
    const offset = (pageNum - 1) * limitNum;
    const countRes = await db.execute({
      sql: "SELECT COUNT(*) as total FROM pedidos WHERE usuario_id = ?",
      args: [usuario_id],
    });
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    const result = await db.execute({
      sql: `SELECT p.*, 
                   (SELECT COUNT(*) FROM detalles_pedidos dp WHERE dp.pedido_id = p.id) as total_items
            FROM pedidos p
            WHERE p.usuario_id = ?
            ORDER BY p.creado_en DESC
            LIMIT ? OFFSET ?`,
      args: [usuario_id, limitNum, offset],
    });

    return {
      pedidos: result.rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  const result = await db.execute({
    sql: `SELECT p.*, 
                 (SELECT COUNT(*) FROM detalles_pedidos dp WHERE dp.pedido_id = p.id) as total_items
          FROM pedidos p
          WHERE p.usuario_id = ?
          ORDER BY p.creado_en DESC`,
    args: [usuario_id],
  });
  return {
    pedidos: result.rows,
    total: result.rows.length,
    page: 1,
    limit: result.rows.length,
    totalPages: 1,
  };
}

// 3. Obtener detalle de pedido por ID con verificacion de propietario o admin
export async function obtenerDetallePedido(pedido_id, usuario_id, esAdmin = false) {
  const pedRes = await db.execute({
    sql: `SELECT p.*, u.nombre as cliente_nombre, u.apellido as cliente_apellido, u.correo as cliente_correo
          FROM pedidos p
          JOIN usuarios u ON p.usuario_id = u.id
          WHERE p.id = ? LIMIT 1`,
    args: [pedido_id],
  });

  const pedido = pedRes.rows[0];
  if (!pedido) {
    return { errorStatus: 404, message: "Pedido no encontrado" };
  }

  // Verificar autorizacion
  if (!esAdmin && pedido.usuario_id !== usuario_id) {
    return { errorStatus: 403, message: "Forbidden: No tienes acceso a este pedido" };
  }

  // Obtener items del pedido
  const itemsRes = await db.execute({
    sql: `SELECT dp.*, pr.nombre as producto_nombre, pr.imagen_url as producto_imagen
          FROM detalles_pedidos dp
          JOIN productos pr ON dp.producto_id = pr.id
          WHERE dp.pedido_id = ?`,
    args: [pedido_id],
  });

  // Obtener historial de estados registrado por triggers
  const histRes = await db.execute({
    sql: `SELECT * FROM historial_estado_pedidos WHERE pedido_id = ? ORDER BY creado_en ASC`,
    args: [pedido_id],
  });

  return {
    pedido,
    items: itemsRes.rows,
    historial: histRes.rows,
  };
}

// 4. Obtener todos los pedidos para administrador (con filtros y paginacion)
export async function obtenerTodosPedidosAdmin(estado = null, fecha = null, page = null, limit = null) {
  let whereSql = " WHERE 1=1";
  const args = [];

  if (estado) {
    whereSql += " AND p.estado = ?";
    args.push(estado);
  }

  if (fecha) {
    whereSql += " AND DATE(p.creado_en) = ?";
    args.push(fecha);
  }

  const countRes = await db.execute({
    sql: `SELECT COUNT(*) as total FROM pedidos p ${whereSql}`,
    args,
  });
  const total = parseInt(countRes.rows[0]?.total || 0, 10);

  let sql = `SELECT p.*, 
                    u.nombre as cliente_nombre, 
                    u.apellido as cliente_apellido, 
                    u.correo as cliente_correo,
                    (SELECT COUNT(*) FROM detalles_pedidos dp WHERE dp.pedido_id = p.id) as total_items
             FROM pedidos p
             JOIN usuarios u ON p.usuario_id = u.id
             ${whereSql}
             ORDER BY p.creado_en DESC`;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (pageNum > 0 && limitNum > 0) {
    const offset = (pageNum - 1) * limitNum;
    sql += " LIMIT ? OFFSET ?";
    const pageArgs = [...args, limitNum, offset];
    const result = await db.execute({ sql, args: pageArgs });
    return {
      pedidos: result.rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  const result = await db.execute({ sql, args });
  return {
    pedidos: result.rows,
    total,
    page: 1,
    limit: total,
    totalPages: 1,
  };
}

// 5. Cambiar el estado de un pedido por parte de un administrador
export async function cambiarEstadoPedido(pedido_id, nuevoEstado) {
  // Obtener estado actual
  const pedRes = await db.execute({
    sql: "SELECT id, estado FROM pedidos WHERE id = ? LIMIT 1",
    args: [pedido_id],
  });

  const pedido = pedRes.rows[0];
  if (!pedido) {
    return { errorStatus: 404, message: "Pedido no encontrado" };
  }

  const estadoActual = pedido.estado;

  // Si ya esta en el mismo estado
  if (estadoActual === nuevoEstado) {
    return { pedido };
  }

  // Validar si la transicion esta permitida
  const permitidos = TRANSICIONES_PERMITIDAS[estadoActual] || [];
  if (!permitidos.includes(nuevoEstado)) {
    return {
      errorStatus: 400,
      message: `No se puede cambiar el estado de "${estadoActual}" a "${nuevoEstado}". Transicion no permitida.`,
    };
  }

  // Actualizar pedido (el trigger trg_registrar_cambio_estado_pedido actualiza el historial automaticamente)
  const upRes = await db.execute({
    sql: `UPDATE pedidos
          SET estado = ?, actualizado_en = datetime('now')
          WHERE id = ?
          RETURNING *`,
    args: [nuevoEstado, pedido_id],
  });

  const pedidoActualizado = upRes.rows[0];

  // Emitir evento SSE de cambio de estado de pedido
  orderEvents.emit("pedido_actualizado", {
    tipo: "actualizado",
    pedido_id: pedidoActualizado.id,
    usuario_id: pedidoActualizado.usuario_id,
    estado: pedidoActualizado.estado,
    pedido: pedidoActualizado,
  });

  return { pedido: pedidoActualizado };
}

// 5. Obtener métricas y KPIs para el Dashboard del Administrador
export async function obtenerMetricasDashboard() {
  const ventasRes = await db.execute(`
    SELECT 
      SUM(CASE WHEN estado = 'entregado' THEN total ELSE 0 END) as total_ventas,
      SUM(CASE WHEN estado = 'entregado' AND DATE(creado_en) = DATE('now') THEN total ELSE 0 END) as ventas_hoy,
      COUNT(CASE WHEN estado = 'entregado' THEN 1 END) as entregados_count,
      COUNT(CASE WHEN estado IN ('pendiente', 'confirmado', 'en_preparacion', 'listo', 'en_camino') THEN 1 END) as activos_count,
      COUNT(CASE WHEN estado = 'cancelado' THEN 1 END) as cancelados_count,
      COUNT(*) as total_pedidos
    FROM pedidos
  `);

  const stats = ventasRes.rows[0] || {};
  const totalVentas = Number(stats.total_ventas || 0);
  const ventasHoy = Number(stats.ventas_hoy || 0);
  const entregadosCount = Number(stats.entregados_count || 0);
  const activosCount = Number(stats.activos_count || 0);
  const canceladosCount = Number(stats.cancelados_count || 0);
  const totalPedidos = Number(stats.total_pedidos || 0);

  const ticketPromedio = entregadosCount > 0 ? (totalVentas / entregadosCount).toFixed(2) : "0.00";

  // Top 5 productos más vendidos
  const topRes = await db.execute(`
    SELECT pr.nombre, pr.categoria, pr.imagen_url, SUM(dp.cantidad) as total_vendidos, SUM(dp.subtotal) as total_ingresos
    FROM detalles_pedidos dp
    JOIN productos pr ON dp.producto_id = pr.id
    JOIN pedidos p ON dp.pedido_id = p.id
    WHERE p.estado = 'entregado'
    GROUP BY pr.id
    ORDER BY total_vendidos DESC
    LIMIT 5
  `);

  return {
    totalVentas,
    ventasHoy,
    entregadosCount,
    activosCount,
    canceladosCount,
    totalPedidos,
    ticketPromedio: Number(ticketPromedio),
    topProductos: topRes.rows || [],
  };
}
