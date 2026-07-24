import { db } from "../db/client.js";
import { calcularTotales } from "../utils/precios.js";

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
export async function crearPedido({ usuario_id, items, direccion_entrega, telefono_contacto, notas, metodo_pago }) {
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

  const metodoPagoFinal = ["efectivo", "transferencia", "otro"].includes(metodo_pago) ? metodo_pago : "efectivo";

  // 4. Insercion en base de datos
  // Insertar encabezado de pedido
  const insertPedidoRes = await db.execute({
    sql: `INSERT INTO pedidos (usuario_id, direccion_entrega, telefono_contacto, notas, estado, subtotal, impuesto, total, metodo_pago)
          VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?, ?)
          RETURNING *`,
    args: [
      usuario_id,
      direccionFinal,
      telefonoFinal || null,
      notas || null,
      totales.subtotal,
      totales.impuesto,
      totales.total,
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

  return {
    pedido: nuevoPedido,
    items: detallesGuardados,
  };
}

// 2. Obtener historial de pedidos de un cliente
export async function obtenerPedidosCliente(usuario_id) {
  const result = await db.execute({
    sql: `SELECT p.*, 
                 (SELECT COUNT(*) FROM detalles_pedidos dp WHERE dp.pedido_id = p.id) as total_items
          FROM pedidos p
          WHERE p.usuario_id = ?
          ORDER BY p.creado_en DESC`,
    args: [usuario_id],
  });
  return result.rows;
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

// 4. Obtener todos los pedidos para administrador (con filtros opcionales)
export async function obtenerTodosPedidosAdmin(estado = null, fecha = null) {
  let sql = `SELECT p.*, 
                    u.nombre as cliente_nombre, 
                    u.apellido as cliente_apellido, 
                    u.correo as cliente_correo,
                    (SELECT COUNT(*) FROM detalles_pedidos dp WHERE dp.pedido_id = p.id) as total_items
             FROM pedidos p
             JOIN usuarios u ON p.usuario_id = u.id
             WHERE 1=1`;
  const args = [];

  if (estado) {
    sql += " AND p.estado = ?";
    args.push(estado);
  }

  if (fecha) {
    sql += " AND DATE(p.creado_en) = ?";
    args.push(fecha);
  }

  sql += " ORDER BY p.creado_en DESC";

  const result = await db.execute({ sql, args });
  return result.rows;
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

  return { pedido: upRes.rows[0] };
}
