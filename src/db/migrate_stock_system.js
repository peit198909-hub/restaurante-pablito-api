// Migración: Control de Stock e Inventario en los Productos
// Agrega la columna 'stock' a la tabla 'productos' en Turso DB si no existe.
import { db } from "./client.js";

export async function migrateStockSystem() {
  try {
    const tableInfo = await db.execute("PRAGMA table_info(productos)");
    const columnas = tableInfo.rows.map((row) => row.name);

    if (!columnas.includes("stock")) {
      await db.execute(
        "ALTER TABLE productos ADD COLUMN stock INTEGER NOT NULL DEFAULT 50 CHECK (stock >= 0)"
      );
      console.log("✅ Migración Stock: columna 'stock' agregada a la tabla 'productos'");
    } else {
      console.log("ℹ️ Migración Stock: columna 'stock' ya existe en la tabla 'productos'");
    }
  } catch (error) {
    console.error("❌ Error en migración de stock de productos:", error.message);
  }
}
