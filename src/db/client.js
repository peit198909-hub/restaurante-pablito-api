import { createClient } from "@libsql/client";

// Obtener variables de entorno. Bun las carga automaticamente de .env
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error("TURSO_DATABASE_URL no esta definida en el archivo .env");
}

// Crear cliente de LibSQL/Turso
export const db = createClient({
  url,
  authToken,
});
