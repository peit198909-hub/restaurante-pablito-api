// Migración: Agregar columna comprobante_url a la tabla pedidos
// Esta columna almacena la URL de Cloudinary del comprobante de transferencia
import { db } from "./client.js";

export async function migrateCloudinary() {
  try {
    // Verificar si la columna ya existe antes de agregarla
    const tableInfo = await db.execute("PRAGMA table_info(pedidos)");
    const columnas = tableInfo.rows.map((row) => row.name);

    if (!columnas.includes("comprobante_url")) {
      await db.execute(
        "ALTER TABLE pedidos ADD COLUMN comprobante_url TEXT"
      );
      console.log("✅ Migración Cloudinary: columna 'comprobante_url' agregada a tabla 'pedidos'");
    } else {
      console.log("ℹ️ Migración Cloudinary: columna 'comprobante_url' ya existe en tabla 'pedidos'");
    }
  } catch (error) {
    console.error("❌ Error en migración Cloudinary:", error.message);
    // No lanzamos el error para no bloquear el arranque del servidor
  }
}
