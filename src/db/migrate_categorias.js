import { db } from "./client.js";

export async function migrateCategorias() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS categorias_productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE,
        descripcion TEXT,
        orden INTEGER DEFAULT 0,
        activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
        creado_en TEXT NOT NULL DEFAULT (datetime('now')),
        actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Comprobar si existen categorías iniciales
    const countRes = await db.execute("SELECT COUNT(*) as total FROM categorias_productos");
    const total = Number(countRes.rows[0]?.total || 0);

    if (total === 0) {
      console.log("🌱 Poblando categorías iniciales del menú...");
      const iniciales = [
        { nombre: "Platos Principales", descripcion: "Platos principales del restaurante", orden: 1 },
        { nombre: "Bebidas", descripcion: "Refrescos, jugos y bebidas", orden: 2 },
        { nombre: "Postres", descripcion: "Dulces y postres artesanales", orden: 3 },
        { nombre: "Entradas", descripcion: "Aperitivos y entradas", orden: 4 },
        { nombre: "Combos", descripcion: "Combos especiales", orden: 5 },
      ];

      for (const cat of iniciales) {
        await db.execute({
          sql: "INSERT OR IGNORE INTO categorias_productos (nombre, descripcion, orden, activa) VALUES (?, ?, ?, 1)",
          args: [cat.nombre, cat.descripcion, cat.orden],
        });
      }
      console.log("✅ Categorías iniciales creadas con éxito.");
    } else {
      console.log("ℹ️ Migración Categorías: tabla 'categorias_productos' verificada con éxito.");
    }
  } catch (error) {
    console.error("❌ Error en migración de categorias_productos:", error.message);
  }
}
