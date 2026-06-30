import { db } from "../db/client.js";

// Registra una accion de usuario en la tabla logs de Turso
export async function logActividad(idUsuario, accion, detalle = null, ip = null) {
  try {
    await db.execute({
      sql: "INSERT INTO logs (id_usuario, accion, detalle, ip) VALUES (?, ?, ?, ?)",
      args: [idUsuario, accion, detalle, ip],
    });
  } catch (error) {
    // Solo registramos en consola si falla para no interrumpir el flujo principal
    console.error("Error al guardar log de actividad:", error);
  }
}
