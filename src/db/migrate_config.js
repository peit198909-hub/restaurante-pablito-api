import { db } from "./client.js";

export async function migrateConfig() {
  if (!process.env.TURSO_DATABASE_URL && !process.env.DATABASE_URL) {
    console.warn("⚠️ TURSO_DATABASE_URL no definida, omitiendo migración automática en Vercel.");
    return;
  }
  console.log("Asegurando tabla configuracion_negocio y campos de envío en Turso DB...");
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS configuracion_negocio (
          id                      INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre_negocio          TEXT    NOT NULL DEFAULT 'Restaurante Pablito',
          telefono_contacto       TEXT    DEFAULT '0991234567',
          direccion_local         TEXT    DEFAULT 'Av. Principal #123, Quito, Ecuador',
          hora_apertura           TEXT    NOT NULL DEFAULT '08:00',
          hora_cierre             TEXT    NOT NULL DEFAULT '22:00',
          dias_atencion           TEXT    NOT NULL DEFAULT 'Lunes a Domingo',
          abierto_manual          INTEGER NOT NULL DEFAULT 1 CHECK (abierto_manual IN (0, 1)),
          costo_base_envio        REAL    NOT NULL DEFAULT 1.50 CHECK (costo_base_envio >= 0),
          precio_por_km           REAL    NOT NULL DEFAULT 0.50 CHECK (precio_por_km >= 0),
          distancia_maxima_km     REAL    NOT NULL DEFAULT 15.0 CHECK (distancia_maxima_km > 0),
          latitud_restaurante     REAL    NOT NULL DEFAULT -0.180653,
          longitud_restaurante    REAL    NOT NULL DEFAULT -78.467838,
          creado_en               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
          actualizado_en          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
    `);

    await db.execute(`
      INSERT INTO configuracion_negocio (
          id, nombre_negocio, hora_apertura, hora_cierre, dias_atencion,
          abierto_manual, costo_base_envio, precio_por_km, distancia_maxima_km,
          latitud_restaurante, longitud_restaurante
      )
      VALUES (
          1, 'Restaurante Pablito', '08:00', '22:00', 'Lunes a Domingo',
          1, 1.50, 0.50, 15.0,
          -0.180653, -78.467838
      )
      ON CONFLICT(id) DO NOTHING;
    `);

    try {
      await db.execute("ALTER TABLE pedidos ADD COLUMN costo_envio REAL NOT NULL DEFAULT 0;");
    } catch (err) {}
    try {
      await db.execute("ALTER TABLE pedidos ADD COLUMN distancia_km REAL NOT NULL DEFAULT 0;");
    } catch (err) {}

    console.log("✅ Migración de configuracion_negocio completada con éxito.");
  } catch (err) {
    console.error("Error durante la migración de configuración:", err);
  }
}
