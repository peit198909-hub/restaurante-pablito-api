// Conexion a la base de datos Turso usando LibSQL
import { createClient } from "@libsql/client";

// Obtener variables de entorno
const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN || "";

if (!process.env.TURSO_DATABASE_URL && !process.env.DATABASE_URL) {
  console.warn("⚠️ Advertencia: TURSO_DATABASE_URL no está definida en las variables de entorno de Vercel.");
}

// Crear cliente de LibSQL/Turso
export const db = createClient({
  url,
  authToken,
});
