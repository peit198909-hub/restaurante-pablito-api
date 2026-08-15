import { db } from "../db/client.js";

// Obtener repartidores (opcionalmente solo activos) desde la tabla de usuarios
export async function obtenerRepartidores(soloActivos = false) {
  let sql = "SELECT id, nombre, apellido, correo, telefono, direccion, rol, activo, creado_en FROM usuarios WHERE rol = 'repartidor'";
  if (soloActivos) {
    sql += " AND activo = 1";
  }
  sql += " ORDER BY nombre ASC, apellido ASC";

  const result = await db.execute({ sql });
  if (result.rows.length === 0) {
    // Si aún no hay usuarios con rol repartidor, consultar la tabla secundaria repartidores_delivery como respaldo
    let sqlBackup = "SELECT * FROM repartidores_delivery";
    if (soloActivos) sqlBackup += " WHERE activo = 1";
    sqlBackup += " ORDER BY nombre ASC, apellido ASC";
    const resBackup = await db.execute({ sql: sqlBackup });
    return resBackup.rows;
  }
  return result.rows;
}

// Crear un nuevo repartidor en la tabla de usuarios
export async function crearRepartidor({
  nombre,
  apellido,
  telefono_whatsapp,
  tipo_vehiculo = "moto",
  placa_vehiculo = "",
  correo,
  contrasena = "repartidor123",
}) {
  const telLimpio = String(telefono_whatsapp || "").replace(/\D/g, "");
  const mail = correo || `repartidor_${Date.now()}@restaurante.com`;
  const contrasenaHash = await Bun.password.hash(contrasena);

  const result = await db.execute({
    sql: `INSERT INTO usuarios (nombre, apellido, correo, contrasena_hash, telefono, direccion, rol, activo)
          VALUES (?, ?, ?, ?, ?, ?, 'repartidor', 1)
          RETURNING id, nombre, apellido, correo, telefono, direccion, rol, activo, creado_en, actualizado_en`,
    args: [nombre.trim(), apellido.trim(), mail, contrasenaHash, telLimpio, placa_vehiculo ? `Vehículo: ${tipo_vehiculo} (${placa_vehiculo})` : `Vehículo: ${tipo_vehiculo}`],
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
