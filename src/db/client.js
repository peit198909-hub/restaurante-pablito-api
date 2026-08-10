// Conexion a la base de datos Turso usando LibSQL
import { createClient } from "@libsql/client";

// Obtener variables de entorno de la base de datos Turso DB
const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "";
const authToken = process.env.TURSO_AUTH_TOKEN || "";

if (!url) {
  console.warn("⚠️ Advertencia: TURSO_DATABASE_URL / DATABASE_URL no está definida en las variables de entorno.");
}

// Crear cliente de LibSQL/Turso
export const db = createClient({
  url,
  authToken,
});
