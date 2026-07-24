import { db } from "../db/client.js";

// Obtener productos activos para clientes (disponible = 1)
export async function obtenerProductosActivos(categoria = null, busqueda = null) {
  let sql = "SELECT * FROM productos WHERE disponible = 1";
  const args = [];

  if (categoria) {
    sql += " AND categoria = ?";
    args.push(categoria);
  }

  if (busqueda) {
    sql += " AND (nombre LIKE ? OR descripcion LIKE ?)";
    args.push(`%${busqueda}%`, `%${busqueda}%`);
  }

  sql += " ORDER BY categoria ASC, nombre ASC";

  const result = await db.execute({ sql, args });
  return result.rows;
}

// Obtener producto por ID (solo disponible para cliente, o cualquiera para admin)
export async function obtenerProductoPorId(id, soloDisponible = true) {
  let sql = "SELECT * FROM productos WHERE id = ?";
  const args = [id];

  if (soloDisponible) {
    sql += " AND disponible = 1";
  }

  const result = await db.execute({ sql, args });
  return result.rows[0] || null;
}

// Obtener categorias activas
export async function obtenerCategoriasActivas() {
  const result = await db.execute({
    sql: "SELECT * FROM categorias_productos WHERE activa = 1 ORDER BY orden ASC, nombre ASC",
    args: [],
  });
  
  // Si la tabla de categorias esta vacia, extraer categorias unicas directamente de productos
  if (result.rows.length === 0) {
    const catsProd = await db.execute({
      sql: "SELECT DISTINCT categoria as nombre FROM productos WHERE disponible = 1 ORDER BY categoria ASC",
      args: [],
    });
    return catsProd.rows.map((row, index) => ({
      id: index + 1,
      nombre: row.nombre,
      descripcion: null,
      orden: index + 1,
      activa: 1,
    }));
  }

  return result.rows;
}

// Obtener todos los productos para administrador (incluye disponibles y no disponibles)
export async function obtenerTodosProductosAdmin() {
  const result = await db.execute({
    sql: "SELECT * FROM productos ORDER BY categoria ASC, id DESC",
    args: [],
  });
  return result.rows;
}

// Crear un nuevo producto
export async function crearProducto({ nombre, descripcion = "", precio, categoria, imagen_url = "", disponible = 1 }) {
  const result = await db.execute({
    sql: `INSERT INTO productos (nombre, descripcion, precio, categoria, imagen_url, disponible)
          VALUES (?, ?, ?, ?, ?, ?)
          RETURNING *`,
    args: [nombre, descripcion, precio, categoria, imagen_url, disponible ? 1 : 0],
  });
  return result.rows[0];
}

// Editar un producto existente
export async function editarProducto(id, { nombre, descripcion, precio, categoria, imagen_url, disponible }) {
  const result = await db.execute({
    sql: `UPDATE productos
          SET nombre = ?, descripcion = ?, precio = ?, categoria = ?, imagen_url = ?, disponible = ?, actualizado_en = datetime('now')
          WHERE id = ?
          RETURNING *`,
    args: [nombre, descripcion, precio, categoria, imagen_url, disponible ? 1 : 0, id],
  });
  return result.rows[0] || null;
}

// Alternar la disponibilidad de un producto (borrado logico)
export async function cambiarDisponibilidadProducto(id, disponible) {
  const result = await db.execute({
    sql: `UPDATE productos
          SET disponible = ?, actualizado_en = datetime('now')
          WHERE id = ?
          RETURNING *`,
    args: [disponible ? 1 : 0, id],
  });
  return result.rows[0] || null;
}
