import { db } from "../db/client.js";

// Obtener la configuración actual del negocio (Registro único id = 1)
export async function obtenerConfiguracion() {
  const res = await db.execute({
    sql: "SELECT * FROM configuracion_negocio WHERE id = 1 LIMIT 1",
    args: [],
  });

  if (res.rows.length === 0) {
    // Si no existiera por alguna razón, retornar configuración fallback por defecto
    return {
      id: 1,
      nombre_negocio: "Restaurante Pablito",
      telefono_contacto: "0991234567",
      direccion_local: "Av. Principal #123, Quito, Ecuador",
      hora_apertura: "08:00",
      hora_cierre: "22:00",
      dias_atencion: "Lunes a Domingo",
      abierto_manual: 1,
      costo_base_envio: 1.50,
      precio_por_km: 0.50,
      distancia_maxima_km: 15.0,
      latitud_restaurante: -0.180653,
      longitud_restaurante: -78.467838,
    };
  }

  const row = res.rows[0];
  return {
    id: row.id,
    nombre_negocio: row.nombre_negocio,
    telefono_contacto: row.telefono_contacto,
    direccion_local: row.direccion_local,
    hora_apertura: row.hora_apertura,
    hora_cierre: row.hora_cierre,
    dias_atencion: row.dias_atencion,
    abierto_manual: Number(row.abierto_manual),
    costo_base_envio: parseFloat(row.costo_base_envio),
    precio_por_km: parseFloat(row.precio_por_km),
    distancia_maxima_km: parseFloat(row.distancia_maxima_km),
    latitud_restaurante: parseFloat(row.latitud_restaurante),
    longitud_restaurante: parseFloat(row.longitud_restaurante),
    actualizado_en: row.actualizado_en,
  };
}

// Actualizar parámetros de la configuración (Solo administradores)
export async function actualizarConfiguracion(datos) {
  const configActual = await obtenerConfiguracion();

  const nombre_negocio = datos.nombre_negocio !== undefined ? datos.nombre_negocio.trim() : configActual.nombre_negocio;
  const telefono_contacto = datos.telefono_contacto !== undefined ? datos.telefono_contacto.trim() : configActual.telefono_contacto;
  const direccion_local = datos.direccion_local !== undefined ? datos.direccion_local.trim() : configActual.direccion_local;
  const hora_apertura = datos.hora_apertura !== undefined ? datos.hora_apertura.trim() : configActual.hora_apertura;
  const hora_cierre = datos.hora_cierre !== undefined ? datos.hora_cierre.trim() : configActual.hora_cierre;
  const dias_atencion = datos.dias_atencion !== undefined ? datos.dias_atencion.trim() : configActual.dias_atencion;
  const abierto_manual = datos.abierto_manual !== undefined ? (datos.abierto_manual ? 1 : 0) : configActual.abierto_manual;
  const costo_base_envio = datos.costo_base_envio !== undefined ? Math.max(0, parseFloat(datos.costo_base_envio)) : configActual.costo_base_envio;
  const precio_por_km = datos.precio_por_km !== undefined ? Math.max(0, parseFloat(datos.precio_por_km)) : configActual.precio_por_km;
  const distancia_maxima_km = datos.distancia_maxima_km !== undefined ? Math.max(0.1, parseFloat(datos.distancia_maxima_km)) : configActual.distancia_maxima_km;
  const latitud_restaurante = datos.latitud_restaurante !== undefined ? parseFloat(datos.latitud_restaurante) : configActual.latitud_restaurante;
  const longitud_restaurante = datos.longitud_restaurante !== undefined ? parseFloat(datos.longitud_restaurante) : configActual.longitud_restaurante;

  await db.execute({
    sql: `UPDATE configuracion_negocio
          SET nombre_negocio = ?,
              telefono_contacto = ?,
              direccion_local = ?,
              hora_apertura = ?,
              hora_cierre = ?,
              dias_atencion = ?,
              abierto_manual = ?,
              costo_base_envio = ?,
              precio_por_km = ?,
              distancia_maxima_km = ?,
              latitud_restaurante = ?,
              longitud_restaurante = ?,
              actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = 1`,
    args: [
      nombre_negocio,
      telefono_contacto,
      direccion_local,
      hora_apertura,
      hora_cierre,
      dias_atencion,
      abierto_manual,
      costo_base_envio,
      precio_por_km,
      distancia_maxima_km,
      latitud_restaurante,
      longitud_restaurante,
    ],
  });

  return await obtenerConfiguracion();
}

// Obtener la hora actual en formato HH:mm según la zona horaria de Ecuador (America/Guayaquil)
export function obtenerHoraActualEcuador() {
  const options = {
    timeZone: "America/Guayaquil",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(new Date());
  let h = "00", m = "00";
  for (const p of parts) {
    if (p.type === "hour") h = p.value;
    if (p.type === "minute") m = p.value;
  }
  if (h === "24") h = "00";
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

// Verificar si el local se encuentra abierto actualmente según horario y estado manual
export function estaAbierto(config) {
  if (!config) return false;
  if (config.abierto_manual === 0) return false;

  // Formato de hora HH:mm en zona horaria Ecuador
  const horaActual = obtenerHoraActualEcuador();

  const apertura = config.hora_apertura || "08:00";
  const cierre = config.hora_cierre || "22:00";

  if (apertura <= cierre) {
    return horaActual >= apertura && horaActual <= cierre;
  } else {
    // Horario nocturno que cruza medianoche (ej: 18:00 a 02:00)
    return horaActual >= apertura || horaActual <= cierre;
  }
}
