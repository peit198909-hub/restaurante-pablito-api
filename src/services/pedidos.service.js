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
export async function crearPedido({ usuario_id, items, direccion_entrega, telefono_contacto, notas, metodo_pago, distancia_km = 0, comprobante_url = null, tipo_entrega = "delivery", estado_inicial = "pendiente" }) {
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

  const tipoEntregaFinal = (tipo_entrega === "retiro" || (direccion_entrega && direccion_entrega.toLowerCase().includes("retiro"))) ? "retiro" : "delivery";

  // 1. Validar cada item y obtener precio real de la BD
  const itemsProcesados = [];
  for (const item of items) {
    const prodRes = await db.execute({
      sql: "SELECT id, nombre, precio, disponible, stock FROM productos WHERE id = ? LIMIT 1",
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

    const stockDisponible = producto.stock !== undefined ? parseInt(producto.stock, 10) : 50;
    if (stockDisponible < cantidad) {
      return {
        errorStatus: 422,
        message: stockDisponible <= 0
          ? `El producto "${producto.nombre}" está agotado.`
          : `No hay suficiente stock para "${producto.nombre}". Solo quedan ${stockDisponible} unidades disponibles.`
      };
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

  if (tipoEntregaFinal === "retiro") {
    if (!direccionFinal) {
      direccionFinal = "Retiro en el local — Restaurante Pablito";
    }
  } else {
    if (!direccionFinal || direccionFinal.trim().length < 3) {
      return { errorStatus: 422, message: "Es obligatorio proporcionar una dirección de entrega válida para pedidos a domicilio." };
    }
  }

  // 3. Recalcular totales en el servidor
  const totales = calcularTotales(
    itemsProcesados.map((i) => ({ precio: i.precio_unitario, cantidad: i.cantidad }))
  );

  // 4. Calcular costo de envío ($0.00 en retiro, por KM en delivery)
  let distKm = 0;
  let costoEnvio = 0;

  if (tipoEntregaFinal === "delivery") {
    distKm = Math.max(0, parseFloat(distancia_km || 0));
    if (distKm > 0) {
      if (distKm > config.distancia_maxima_km) {
        return {
          errorStatus: 422,
          message: `La distancia de envío (${distKm} km) supera el límite máximo del local (${config.distancia_maxima_km} km).`,
        };
      }
      costoEnvio = Math.round((config.costo_base_envio + (distKm * config.precio_por_km)) * 100) / 100;
    }
  }

  const totalFinal = Math.round((totales.total + costoEnvio) * 100) / 100;
  const metodoPagoFinal = ["efectivo", "transferencia", "otro"].includes(metodo_pago) ? metodo_pago : "efectivo";
  const comprobanteUrlFinal = (metodoPagoFinal === "transferencia" && comprobante_url) ? comprobante_url : null;

  const estadoPermitido = ["pendiente", "confirmado", "en_preparacion", "listo", "entregado"].includes(estado_inicial) ? estado_inicial : "pendiente";

  // Validar y asegurar usuario_id existente en la tabla usuarios para evitar errores de Clave Foránea (FOREIGN KEY)
  let usuarioIdValido = usuario_id;
  if (!usuarioIdValido) {
    const defaultUsr = await db.execute("SELECT id FROM usuarios ORDER BY id ASC LIMIT 1");
    usuarioIdValido = defaultUsr.rows[0]?.id;
  } else {
    const checkUsr = await db.execute({
      sql: "SELECT id FROM usuarios WHERE id = ? LIMIT 1",
      args: [usuarioIdValido],
    });
    if (checkUsr.rows.length === 0) {
      const fallbackUsr = await db.execute("SELECT id FROM usuarios ORDER BY id ASC LIMIT 1");
      usuarioIdValido = fallbackUsr.rows[0]?.id;
    }
  }

  if (!usuarioIdValido) {
    return { errorStatus: 400, message: "No existe un usuario en el sistema para vincular el pedido." };
  }

  // 5. Insercion en base de datos
  const insertPedidoRes = await db.execute({
    sql: `INSERT INTO pedidos (usuario_id, direccion_entrega, telefono_contacto, notas, estado, subtotal, impuesto, costo_envio, distancia_km, total, metodo_pago, comprobante_url, tipo_entrega, creado_en)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
          RETURNING *`,
    args: [
      usuarioIdValido,
      direccionFinal,
      telefonoFinal || null,
      notas || null,
      estadoPermitido,
      totales.subtotal,
      totales.impuesto,
      costoEnvio,
      distKm,
      totalFinal,
      metodoPagoFinal,
      comprobanteUrlFinal,
      tipoEntregaFinal,
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

  // Descontar el stock de los productos comprados
  for (const item of itemsProcesados) {
    await db.execute({
      sql: "UPDATE productos SET stock = MAX(0, stock - ?) WHERE id = ?",
      args: [item.cantidad, item.producto_id],
    });
  }

  // Si la entrega es a domicilio, intentar asignación automática dinámica a repartidor
  if (tipoEntregaFinal === "delivery") {
    await buscarYAsignarRepartidorDisponible(nuevoPedido.id);
  }

  // Obtener el pedido actualizado con repartidor_id si fue asignado
  const pedidoActualizadoRes = await db.execute({
    sql: "SELECT * FROM pedidos WHERE id = ? LIMIT 1",
    args: [nuevoPedido.id],
  });
  const pedidoFinal = pedidoActualizadoRes.rows[0] || nuevoPedido;

  // Emitir evento SSE de creacion de pedido
  orderEvents.emit("pedido_actualizado", {
    tipo: "creado",
    pedido_id: pedidoFinal.id,
    usuario_id: pedidoFinal.usuario_id,
    estado: pedidoFinal.estado,
    total: pedidoFinal.total,
    repartidor_id: pedidoFinal.repartidor_id,
    pedido: pedidoFinal,
  });

  return {
    pedido: pedidoFinal,
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
    sql: `SELECT p.*, 
                 u.nombre as cliente_nombre, 
                 u.apellido as cliente_apellido, 
                 u.correo as cliente_correo,
                 rep.nombre as repartidor_nombre,
                 rep.apellido as repartidor_apellido
          FROM pedidos p
          JOIN usuarios u ON p.usuario_id = u.id
          LEFT JOIN usuarios rep ON p.repartidor_id = rep.id
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
  // Auto-asignación de seguridad: Asignar cualquier pedido de delivery pendiente a repartidores activos
  try {
    const unassignedRes = await db.execute(
      "SELECT id FROM pedidos WHERE repartidor_id IS NULL AND (tipo_entrega = 'delivery' OR tipo_entrega IS NULL OR direccion_entrega NOT LIKE '%Retiro%') AND estado != 'cancelado'"
    );
    if (unassignedRes.rows && unassignedRes.rows.length > 0) {
      for (const row of unassignedRes.rows) {
        await buscarYAsignarRepartidorDisponible(row.id);
      }
    }
  } catch (err) {
    // Ignorar si no hay tabla
  }

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
                    rep.nombre as repartidor_nombre,
                    rep.apellido as repartidor_apellido,
                    (SELECT COUNT(*) FROM detalles_pedidos dp WHERE dp.pedido_id = p.id) as total_items
             FROM pedidos p
             JOIN usuarios u ON p.usuario_id = u.id
             LEFT JOIN usuarios rep ON p.repartidor_id = rep.id
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
    sql: "SELECT id, estado, tipo_entrega, direccion_entrega FROM pedidos WHERE id = ? LIMIT 1",
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

  // Prevenir que pedidos de retiro en local pasen por el estado 'en_camino'
  const esRetiro = pedido.tipo_entrega === "retiro" ||
    (pedido.direccion_entrega && pedido.direccion_entrega.toLowerCase().includes("retiro"));

  if (nuevoEstado === "en_camino" && esRetiro) {
    return {
      errorStatus: 400,
      message: "El estado 'En Camino' solo está disponible para pedidos de Delivery a domicilio.",
    };
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

  // Si el pedido fue cancelado, devolver automáticamente el stock a los productos
  if (nuevoEstado === "cancelado" && estadoActual !== "cancelado") {
    const itemsRes = await db.execute({
      sql: "SELECT producto_id, cantidad FROM detalles_pedidos WHERE pedido_id = ?",
      args: [pedido_id],
    });
    for (const item of itemsRes.rows || []) {
      await db.execute({
        sql: "UPDATE productos SET stock = stock + ? WHERE id = ?",
        args: [item.cantidad, item.producto_id],
      });
    }
  }

  // Emitir evento SSE / Ably de cambio de estado de pedido
  orderEvents.emit("pedido_actualizado", {
    tipo: "actualizado",
    pedido_id: pedidoActualizado.id,
    usuario_id: pedidoActualizado.usuario_id,
    repartidor_id: pedidoActualizado.repartidor_id,
    estado: pedidoActualizado.estado,
    pedido: pedidoActualizado,
  });

  return { pedido: pedidoActualizado };
}

// 5. Obtener métricas y KPIs para el Dashboard del Administrador
export async function obtenerMetricasDashboard() {
  const ventasRes = await db.execute(`
    SELECT 
      SUM(CASE WHEN estado != 'cancelado' THEN total ELSE 0 END) as total_ventas,
      SUM(CASE WHEN estado != 'cancelado' AND (DATE(creado_en) = DATE('now') OR DATE(creado_en) = DATE('now', 'localtime') OR substr(creado_en, 1, 10) = DATE('now') OR substr(creado_en, 1, 10) = DATE('now', 'localtime')) THEN total ELSE 0 END) as ventas_hoy,
      COUNT(CASE WHEN estado = 'entregado' THEN 1 END) as entregados_count,
      COUNT(CASE WHEN estado IN ('pendiente', 'confirmado', 'en_preparacion', 'listo', 'en_camino') THEN 1 END) as activos_count,
      COUNT(CASE WHEN estado = 'cancelado' THEN 1 END) as cancelados_count,
      COUNT(CASE WHEN estado != 'cancelado' THEN 1 END) as ventas_count,
      COUNT(*) as total_pedidos
    FROM pedidos
  `);

  const stats = ventasRes.rows[0] || {};
  const totalVentas = Number(stats.total_ventas || 0);
  const ventasHoy = Number(stats.ventas_hoy || 0);
  const entregadosCount = Number(stats.entregados_count || 0);
  const activosCount = Number(stats.activos_count || 0);
  const canceladosCount = Number(stats.cancelados_count || 0);
  const ventasCount = Number(stats.ventas_count || 0);
  const totalPedidos = Number(stats.total_pedidos || 0);

  const ticketPromedio = ventasCount > 0 ? (totalVentas / ventasCount).toFixed(2) : "0.00";

  // Top 5 productos más vendidos (excluyendo ventas canceladas)
  const topRes = await db.execute(`
    SELECT pr.nombre, pr.categoria, pr.imagen_url, SUM(dp.cantidad) as total_vendidos, SUM(dp.subtotal) as total_ingresos
    FROM detalles_pedidos dp
    JOIN productos pr ON dp.producto_id = pr.id
    JOIN pedidos p ON dp.pedido_id = p.id
    WHERE p.estado != 'cancelado'
    GROUP BY pr.id
    ORDER BY total_vendidos DESC
    LIMIT 5
  `);

  // Útimos 10 pedidos para el historial de ventas y deliveries en tiempo real
  const ultimosRes = await db.execute(`
    SELECT p.id, p.estado, p.subtotal, p.impuesto, p.costo_envio, p.total, p.metodo_pago, p.tipo_entrega, p.creado_en, p.actualizado_en,
           u.nombre as cliente_nombre, u.apellido as cliente_apellido,
           r.nombre as repartidor_nombre, r.apellido as repartidor_apellido
    FROM pedidos p
    LEFT JOIN usuarios u ON p.usuario_id = u.id
    LEFT JOIN usuarios r ON p.repartidor_id = r.id
    ORDER BY p.id DESC
    LIMIT 10
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
    ultimosPedidos: ultimosRes.rows || [],
  };
}

// 7. Adjuntar comprobante de transferencia a un pedido existente
export async function adjuntarComprobante(pedidoId, usuarioId, comprobanteUrl) {
  // Verificar que el pedido existe y pertenece al usuario
  const pedidoRes = await db.execute({
    sql: "SELECT id, usuario_id, metodo_pago, estado FROM pedidos WHERE id = ? LIMIT 1",
    args: [pedidoId],
  });

  const pedido = pedidoRes.rows[0];
  if (!pedido) {
    return { errorStatus: 404, message: "Pedido no encontrado" };
  }

  if (pedido.usuario_id !== usuarioId) {
    return { errorStatus: 403, message: "No tiene permisos para modificar este pedido" };
  }

  if (pedido.metodo_pago !== "transferencia") {
    return { errorStatus: 422, message: "Solo se pueden adjuntar comprobantes a pedidos con método de pago 'transferencia'" };
  }

  // Actualizar el comprobante_url del pedido
  const updateRes = await db.execute({
    sql: "UPDATE pedidos SET comprobante_url = ? WHERE id = ? RETURNING *",
    args: [comprobanteUrl, pedidoId],
  });

  return {
    pedido: updateRes.rows[0],
  };
}

/**
 * Busca un repartidor activo disponible (sin pedido activo en curso)
 * y le asigna el pedido.
 * Si todos están ocupados, el pedido permanece sin asignar (repartidor_id = NULL).
 */
export async function buscarYAsignarRepartidorDisponible(pedidoId) {
  try {
    // 1. Obtener todos los repartidores activos del sistema
    const repsRes = await db.execute(
      "SELECT id, nombre, apellido FROM usuarios WHERE rol = 'repartidor' AND activo = 1 ORDER BY id ASC"
    );
    const repartidores = repsRes.rows || [];
    if (repartidores.length === 0) return null;

    // 2. Calcular la carga de trabajo activa (pedidos sin entregar) de cada repartidor
    const repartidoresConCarga = [];
    for (const rep of repartidores) {
      const activeRes = await db.execute({
        sql: `SELECT COUNT(*) as count FROM pedidos 
              WHERE repartidor_id = ? AND estado IN ('pendiente', 'confirmado', 'en_preparacion', 'listo', 'en_camino')`,
        args: [rep.id],
      });
      const activeCount = Number(activeRes.rows[0]?.count || 0);
      repartidoresConCarga.push({ ...rep, activeCount });
    }

    // 3. Ordenar repartidores por menor carga de trabajo activa
    repartidoresConCarga.sort((a, b) => a.activeCount - b.activeCount);

    const minCarga = repartidoresConCarga[0].activeCount;
    const candidatos = repartidoresConCarga.filter((r) => r.activeCount === minCarga);
    const seleccionado = candidatos[Math.floor(Math.random() * candidatos.length)];

    if (seleccionado) {
      await db.execute({
        sql: "UPDATE pedidos SET repartidor_id = ? WHERE id = ?",
        args: [seleccionado.id, pedidoId],
      });

      console.log(
        `🤖 Asignación inteligente: Pedido #${pedidoId} asignado a repartidor ${seleccionado.nombre} ${seleccionado.apellido} (ID: ${seleccionado.id}, Carga activa: ${seleccionado.activeCount})`
      );

      const pedQuery = await db.execute({
        sql: "SELECT usuario_id, estado FROM pedidos WHERE id = ? LIMIT 1",
        args: [pedidoId],
      });
      const pedData = pedQuery.rows[0] || {};

      orderEvents.emit("pedido_actualizado", {
        tipo: "asignado",
        pedido_id: pedidoId,
        usuario_id: pedData.usuario_id,
        repartidor_id: seleccionado.id,
        estado: pedData.estado || "pendiente",
      });

      return seleccionado;
    }
  } catch (err) {
    console.error("Error en asignación inteligente de repartidor:", err);
  }
  return null;
}

/**
 * Busca el pedido sin repartidor más antiguo que esté en cola y se lo asigna
 * al repartidor especificado cuando completa su entrega actual.
 */
export async function procesarSiguientePedidoEnCola(repartidorId) {
  try {
    const pendingRes = await db.execute({
      sql: `SELECT id FROM pedidos 
            WHERE repartidor_id IS NULL AND (tipo_entrega = 'delivery' OR tipo_entrega IS NULL) AND estado IN ('pendiente', 'confirmado', 'en_preparacion', 'listo') 
            ORDER BY id ASC LIMIT 1`,
    });

    const siguientePedido = pendingRes.rows[0];
    if (siguientePedido) {
      await db.execute({
        sql: "UPDATE pedidos SET repartidor_id = ? WHERE id = ?",
        args: [repartidorId, siguientePedido.id],
      });

      console.log(`🤖 Cola de pedidos: Pedido #${siguientePedido.id} asignado automáticamente al repartidor ID: ${repartidorId}`);

      const pedidoInfoRes = await db.execute({
        sql: "SELECT usuario_id, estado FROM pedidos WHERE id = ? LIMIT 1",
        args: [siguientePedido.id],
      });
      const pedidoInfo = pedidoInfoRes.rows[0] || {};

      orderEvents.emit("pedido_actualizado", {
        tipo: "asignado",
        pedido_id: siguientePedido.id,
        usuario_id: pedidoInfo.usuario_id,
        repartidor_id: repartidorId,
        estado: pedidoInfo.estado || "pendiente",
      });

      return siguientePedido.id;
    }
  } catch (err) {
    console.error("Error procesando cola de pedidos para repartidor:", err);
  }
  return null;
}

/**
 * Asigna o desasigna manualmente un repartidor a un pedido (Administrador)
 */
export async function asignarRepartidorManual(pedidoId, repartidorId) {
  const targetRepId = repartidorId ? parseInt(repartidorId, 10) : null;

  const pedRes = await db.execute({
    sql: "SELECT * FROM pedidos WHERE id = ? LIMIT 1",
    args: [pedidoId],
  });
  if (pedRes.rows.length === 0) {
    return { errorStatus: 404, message: "Pedido no encontrado" };
  }

  let finalRepId = targetRepId;
  if (finalRepId) {
    const checkUsr = await db.execute({
      sql: "SELECT id FROM usuarios WHERE id = ? LIMIT 1",
      args: [finalRepId],
    });
    if (checkUsr.rows.length === 0) {
      finalRepId = null; // Si no existe en usuarios, dejar sin asignar para evitar fallo de Foreign Key
    }
  }

  await db.execute({
    sql: "UPDATE pedidos SET repartidor_id = ? WHERE id = ?",
    args: [finalRepId, pedidoId],
  });

  const updatedRes = await db.execute({
    sql: "SELECT p.*, r.nombre as repartidor_nombre, r.apellido as repartidor_apellido FROM pedidos p LEFT JOIN usuarios r ON p.repartidor_id = r.id WHERE p.id = ? LIMIT 1",
    args: [pedidoId],
  });
  const updatedPedido = updatedRes.rows[0];

  orderEvents.emit("pedido_actualizado", {
    tipo: "asignado",
    pedido_id: pedidoId,
    usuario_id: updatedPedido.usuario_id,
    repartidor_id: targetRepId,
    estado: updatedPedido.estado,
  });

  return { pedido: updatedPedido };
}

/**
 * Obtener la entrega activa asignada a un repartidor (repartidor_id)
 */
export async function obtenerEntregaActivaRepartidor(repartidorId) {
  const res = await db.execute({
    sql: `SELECT p.*, u.nombre as cliente_nombre, u.apellido as cliente_apellido, u.correo as cliente_correo, u.telefono as cliente_telefono
          FROM pedidos p
          LEFT JOIN usuarios u ON p.usuario_id = u.id
          WHERE p.repartidor_id = ? AND p.estado IN ('pendiente', 'confirmado', 'en_preparacion', 'listo', 'en_camino')
          ORDER BY p.id ASC`,
    args: [repartidorId],
  });

  const pedidos = res.rows || [];
  if (pedidos.length === 0) return null;

  const entregas = [];
  for (const ped of pedidos) {
    const itemsRes = await db.execute({
      sql: `SELECT dp.*, pr.nombre as producto_nombre, pr.imagen_url as producto_imagen
            FROM detalles_pedidos dp
            JOIN productos pr ON dp.producto_id = pr.id
            WHERE dp.pedido_id = ?`,
      args: [ped.id],
    });
    entregas.push({
      pedido: ped,
      items: itemsRes.rows || [],
    });
  }

  return {
    pedido: entregas[0].pedido,
    items: entregas[0].items,
    entregas,
  };
}

/**
 * Obtener historial de entregas completadas por un repartidor
 */
export async function obtenerHistorialEntregasRepartidor(repartidorId, page = 1, limit = 10) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const offset = (pageNum - 1) * limitNum;

  const countRes = await db.execute({
    sql: "SELECT COUNT(*) as total FROM pedidos WHERE repartidor_id = ? AND estado = 'entregado'",
    args: [repartidorId],
  });
  const total = parseInt(countRes.rows[0]?.total || 0, 10);

  const res = await db.execute({
    sql: `SELECT p.*, u.nombre as cliente_nombre, u.apellido as cliente_apellido
          FROM pedidos p
          LEFT JOIN usuarios u ON p.usuario_id = u.id
          WHERE p.repartidor_id = ? AND p.estado = 'entregado'
          ORDER BY p.actualizado_en DESC LIMIT ? OFFSET ?`,
    args: [repartidorId, limitNum, offset],
  });

  return {
    entregas: res.rows || [],
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

/**
 * Cambiar el estado de un pedido por parte del repartidor asignado (en_camino o entregado)
 */
export async function cambiarEstadoPorRepartidor(pedidoId, repartidorId, nuevoEstado) {
  if (!["en_camino", "entregado"].includes(nuevoEstado)) {
    return { errorStatus: 400, message: "El repartidor solo puede cambiar el estado a 'en_camino' o 'entregado'" };
  }

  const checkRes = await db.execute({
    sql: "SELECT id, estado, repartidor_id FROM pedidos WHERE id = ? LIMIT 1",
    args: [pedidoId],
  });

  const pedido = checkRes.rows[0];
  if (!pedido) {
    return { errorStatus: 404, message: "Pedido no encontrado" };
  }

  if (Number(pedido.repartidor_id) !== Number(repartidorId)) {
    return { errorStatus: 403, message: "Este pedido no está asignado a tu cuenta" };
  }

  const updateRes = await db.execute({
    sql: `UPDATE pedidos SET estado = ?, actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? RETURNING *`,
    args: [nuevoEstado, pedidoId],
  });

  const pedidoActualizado = updateRes.rows[0];

  // Si se marcó como entregado, el repartidor queda libre → procesar automáticamente el siguiente pedido de la cola
  if (nuevoEstado === "entregado") {
    await procesarSiguientePedidoEnCola(repartidorId);
  }

  orderEvents.emit("pedido_actualizado", {
    tipo: "estado_cambiado",
    pedido_id: pedidoId,
    usuario_id: pedidoActualizado.usuario_id,
    repartidor_id: repartidorId,
    estado: nuevoEstado,
    pedido: pedidoActualizado,
  });

  return { pedido: pedidoActualizado };
}
