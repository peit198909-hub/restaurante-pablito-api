// Migración: Columna tipo_entrega para pedidos ('delivery' | 'retiro')
import { db } from "./client.js";

export async function migrateTipoEntrega() {
  try {
    const tableInfo = await db.execute("PRAGMA table_info(pedidos)");
    const columnas = tableInfo.rows.map((row) => row.name);

    if (!columnas.includes("tipo_entrega")) {
      await db.execute(
        "ALTER TABLE pedidos ADD COLUMN tipo_entrega TEXT NOT NULL DEFAULT 'delivery' CHECK (tipo_entrega IN ('delivery', 'retiro'))"
      );
      console.log("✅ Migración Tipo Entrega: columna 'tipo_entrega' agregada a tabla 'pedidos'");
    } else {
      console.log("ℹ️ Migración Tipo Entrega: columna 'tipo_entrega' ya existe en tabla 'pedidos'");
    }
  } catch (error) {
    console.error("❌ Error en migración de tipo_entrega de pedidos:", error.message);
  }
}
