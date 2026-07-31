import { db } from "../db/client.js";

const FOTOS_DEFAULT = {
  "Platos Principales": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80",
  "Bebidas": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
  "Postres": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
  "Entradas": "https://images.unsplash.com/photo-1541529086526-db283c563270?auto=format&fit=crop&w=600&q=80",
  "Combos": "https://images.unsplash.com/photo-1561758033-d89a9ad46330?auto=format&fit=crop&w=600&q=80",
};

export function sanitizarImagenUrl(url, categoria = "Platos Principales") {
  if (!url || typeof url !== "string") {
    return FOTOS_DEFAULT[categoria] || FOTOS_DEFAULT["Platos Principales"];
  }
  const clean = url.trim();

  // Si termina con barra "/" o extensión de página HTML/PHP, es una página web
  if (clean.endsWith("/") || /\.html?$/i.test(clean) || /\.php$/i.test(clean)) {
    return FOTOS_DEFAULT[categoria] || FOTOS_DEFAULT["Platos Principales"];
  }

  // Si contiene extensiones de archivo de imagen conocidas (.jpg, .png, .webp, etc.), es 100% válida
  if (/\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(clean)) {
    return clean;
  }

  // Si es una URL http/https completa válida
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean;
  }

  return FOTOS_DEFAULT[categoria] || FOTOS_DEFAULT["Platos Principales"];
}

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
  return result.rows.map((p) => ({
    ...p,
    imagen_url: sanitizarImagenUrl(p.imagen_url, p.categoria),
  }));
}

// Obtener producto por ID (solo disponible para cliente, o cualquiera para admin)
export async function obtenerProductoPorId(id, soloDisponible = true) {
  let sql = "SELECT * FROM productos WHERE id = ?";
  const args = [id];

  if (soloDisponible) {
    sql += " AND disponible = 1";
  }

  const result = await db.execute({ sql, args });
  const producto = result.rows[0] || null;
  if (producto) {
    producto.imagen_url = sanitizarImagenUrl(producto.imagen_url, producto.categoria);
  }
  return producto;
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

// Obtener todos los productos para administrador con paginacion opcional
export async function obtenerTodosProductosAdmin(page = null, limit = null) {
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (pageNum > 0 && limitNum > 0) {
    const offset = (pageNum - 1) * limitNum;

    const countRes = await db.execute({
      sql: "SELECT COUNT(*) as total FROM productos",
      args: [],
    });
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    const result = await db.execute({
      sql: "SELECT * FROM productos ORDER BY categoria ASC, id DESC LIMIT ? OFFSET ?",
      args: [limitNum, offset],
    });

    const productosClean = result.rows.map((p) => ({
      ...p,
      imagen_url: sanitizarImagenUrl(p.imagen_url, p.categoria),
    }));

    return {
      productos: productosClean,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  const result = await db.execute({
    sql: "SELECT * FROM productos ORDER BY categoria ASC, id DESC",
    args: [],
  });

  const productosClean = result.rows.map((p) => ({
    ...p,
    imagen_url: sanitizarImagenUrl(p.imagen_url, p.categoria),
  }));

  return {
    productos: productosClean,
    total: productosClean.length,
    page: 1,
    limit: productosClean.length,
    totalPages: 1,
  };
}

// Crear un nuevo producto evitando duplicados
export async function crearProducto({ nombre, descripcion = "", precio, categoria, imagen_url = "", disponible = 1 }) {
  const urlSanitizada = sanitizarImagenUrl(imagen_url, categoria);
  const nombreLimpio = nombre.trim();

  // Prevenir duplicados si ya existe un producto con el mismo nombre y categoria
  const existeRes = await db.execute({
    sql: "SELECT * FROM productos WHERE LOWER(TRIM(nombre)) = LOWER(?) AND categoria = ? LIMIT 1",
    args: [nombreLimpio, categoria],
  });

  if (existeRes.rows.length > 0) {
    const prodExistente = existeRes.rows[0];
    return await editarProducto(prodExistente.id, {
      nombre: nombreLimpio,
      descripcion,
      precio,
      categoria,
      imagen_url: urlSanitizada,
      disponible: 1,
    });
  }

  const result = await db.execute({
    sql: `INSERT INTO productos (nombre, descripcion, precio, categoria, imagen_url, disponible)
          VALUES (?, ?, ?, ?, ?, ?)
          RETURNING *`,
    args: [nombreLimpio, descripcion, precio, categoria, urlSanitizada, disponible ? 1 : 0],
  });
  return result.rows[0];
}

// Editar un producto existente
export async function editarProducto(id, { nombre, descripcion, precio, categoria, imagen_url, disponible }) {
  const urlSanitizada = sanitizarImagenUrl(imagen_url, categoria);

  const result = await db.execute({
    sql: `UPDATE productos
          SET nombre = ?, descripcion = ?, precio = ?, categoria = ?, imagen_url = ?, disponible = ?, actualizado_en = datetime('now')
          WHERE id = ?
          RETURNING *`,
    args: [nombre.trim(), descripcion, precio, categoria, urlSanitizada, disponible ? 1 : 0, id],
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
