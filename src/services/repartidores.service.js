import { db } from "../db/client.js";

// Obtener repartidores (opcionalmente solo activos)
export async function obtenerRepartidores(soloActivos = false) {
  let sql = "SELECT * FROM repartidores_delivery";
  const args = [];

  if (soloActivos) {
    sql += " WHERE activo = 1";
  }

  sql += " ORDER BY nombre ASC, apellido ASC";

  const result = await db.execute({ sql, args });
  return result.rows;
}

// Crear un nuevo repartidor
export async function crearRepartidor({
  nombre,
  apellido,
  telefono_whatsapp,
  tipo_vehiculo = "moto",
  placa_vehiculo = "",
}) {
  // Limpiar número de WhatsApp dejando solo dígitos (ej: 593991234567)
  const telLimpio = String(telefono_whatsapp).replace(/\D/g, "");

  const result = await db.execute({
    sql: `INSERT INTO repartidores_delivery (nombre, apellido, telefono_whatsapp, tipo_vehiculo, placa_vehiculo, activo)
          VALUES (?, ?, ?, ?, ?, 1)
          RETURNING *`,
    args: [nombre.trim(), apellido.trim(), telLimpio, tipo_vehiculo, placa_vehiculo.trim() || null],
  });
  return result.rows[0];
}

// Editar repartidor
export async function editarRepartidor(
  id,
  { nombre, apellido, telefono_whatsapp, tipo_vehiculo, placa_vehiculo, activo }
) {
  const telLimpio = String(telefono_whatsapp).replace(/\D/g, "");

  const result = await db.execute({
    sql: `UPDATE repartidores_delivery
          SET nombre = ?, apellido = ?, telefono_whatsapp = ?, tipo_vehiculo = ?, placa_vehiculo = ?, activo = ?, actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = ?
          RETURNING *`,
    args: [
      nombre.trim(),
      apellido.trim(),
      telLimpio,
      tipo_vehiculo,
      placa_vehiculo ? placa_vehiculo.trim() : null,
      activo ? 1 : 0,
      id,
    ],
  });
  return result.rows[0] || null;
}

// Alternar estado activo / inactivo de repartidor
export async function cambiarEstadoRepartidor(id, activo) {
  const result = await db.execute({
    sql: `UPDATE repartidores_delivery
          SET activo = ?, actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = ?
          RETURNING *`,
    args: [activo ? 1 : 0, id],
  });
  return result.rows[0] || null;
}
