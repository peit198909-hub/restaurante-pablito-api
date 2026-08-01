// Migración: Sistema de Repartidores con inicio de sesión y asignación dinámica
// 1. Agrega el rol 'repartidor' a la tabla usuarios en Turso DB
// 2. Agrega la columna repartidor_id a la tabla pedidos si no existe
import { db } from "./client.js";

export async function migrateRepartidorSystem() {
  try {
    // 1. Verificar y actualizar la tabla usuarios para permitir rol 'repartidor'
    const masterInfo = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='usuarios'");
    const tableSql = masterInfo.rows[0]?.sql || "";

    if (tableSql && !tableSql.toLowerCase().includes("repartidor")) {
      console.log("🔄 Reconstruyendo tabla 'usuarios' en Turso DB para agregar rol 'repartidor'...");

      await db.execute("CREATE TABLE IF NOT EXISTS usuarios_backup AS SELECT * FROM usuarios");
      await db.execute("DROP TABLE usuarios");

      await db.execute(`
        CREATE TABLE usuarios (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre          TEXT    NOT NULL,
          apellido        TEXT    NOT NULL,
          correo          TEXT    NOT NULL UNIQUE,
          contrasena_hash TEXT    NOT NULL,
          telefono        TEXT,
          direccion       TEXT,
          rol             TEXT    NOT NULL DEFAULT 'cliente'
                          CHECK (rol IN ('cliente', 'administrador', 'repartidor')),
          activo          INTEGER NOT NULL DEFAULT 1
                          CHECK (activo IN (0, 1)),
          creado_en       TEXT    NOT NULL DEFAULT (datetime('now')),
          actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now'))
        )
      `);

      await db.execute(`
        INSERT INTO usuarios (id, nombre, apellido, correo, contrasena_hash, telefono, direccion, rol, activo, creado_en, actualizado_en)
        SELECT id, nombre, apellido, correo, contrasena_hash, telefono, direccion, rol, activo, creado_en, actualizado_en FROM usuarios_backup
      `);

      await db.execute("DROP TABLE usuarios_backup");

      console.log("✅ Tabla 'usuarios' reconstruida con éxito para permitir el rol 'repartidor'");
    } else {
      console.log("ℹ️ Migración Repartidores: tabla 'usuarios' ya soporta el rol 'repartidor'");
    }

    // 2. Verificar y agregar columna repartidor_id a tabla pedidos
    const tableInfo = await db.execute("PRAGMA table_info(pedidos)");
    const columnas = tableInfo.rows.map((row) => row.name);

    if (!columnas.includes("repartidor_id")) {
      await db.execute(
        "ALTER TABLE pedidos ADD COLUMN repartidor_id INTEGER REFERENCES usuarios(id)"
      );
      console.log("✅ Migración Repartidores: columna 'repartidor_id' agregada a tabla 'pedidos'");
    } else {
      console.log("ℹ️ Migración Repartidores: columna 'repartidor_id' ya existe en tabla 'pedidos'");
    }
  } catch (error) {
    console.error("❌ Error en migración del sistema de repartidores:", error.message);
  }
}
