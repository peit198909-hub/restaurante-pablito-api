import { db } from "./client.js";

// Funcion para ejecutar las migraciones en Turso
async function runMigration() {
  console.log("Iniciando migracion en Turso...");
  try {
    // Crear tabla logs si no existe
    await db.execute(`
      CREATE TABLE IF NOT EXISTS logs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        id_usuario   INTEGER REFERENCES usuarios(id),
        accion       TEXT NOT NULL,     -- ej: 'REGISTRO', 'LOGIN', 'LOGIN_FALLIDO', 'ACTUALIZAR_PERFIL', 'CREAR_ADMIN'
        detalle      TEXT,              -- descripcion adicional de la accion
        ip           TEXT,              -- ip de origen si esta disponible
        creado_en    TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    console.log("Migracion completada con exito: Tabla logs creada o verificada.");
  } catch (error) {
    console.error("Error durante la migracion:", error);
    process.exit(1);
  }
}

runMigration();
