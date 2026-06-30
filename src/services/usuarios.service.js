import { db } from "../db/client.js";

// Busca un usuario por su correo electronico
export async function buscarUsuarioPorCorreo(correo) {
  const result = await db.execute({
    sql: "SELECT * FROM usuarios WHERE correo = ? LIMIT 1",
    args: [correo],
  });
  return result.rows[0] || null;
}

// Registra un nuevo cliente
export async function registrarCliente({ nombre, apellido, correo, contrasena, telefono = null, direccion = null }) {
  const contrasenaHash = await Bun.password.hash(contrasena);
  
  const result = await db.execute({
    sql: `INSERT INTO usuarios (nombre, apellido, correo, contrasena_hash, telefono, direccion, rol, activo)
          VALUES (?, ?, ?, ?, ?, ?, 'cliente', 1)
          RETURNING id, nombre, apellido, correo, telefono, direccion, rol, activo, creado_en, actualizado_en`,
    args: [nombre, apellido, correo, contrasenaHash, telefono, direccion],
  });
  
  return result.rows[0];
}

// Verifica las credenciales de correo y contrasena
export async function verificarCredenciales(correo, contrasena) {
  const usuario = await buscarUsuarioPorCorreo(correo);
  if (!usuario) {
    return null;
  }
  
  // Validar si el usuario esta activo
  if (usuario.activo !== 1) {
    return { inactivo: true };
  }
  
  const esValida = await Bun.password.verify(contrasena, usuario.contrasena_hash);
  if (!esValida) {
    return null;
  }
  
  // Retornar datos del usuario sin contrasena_hash
  const { contrasena_hash, ...datosUsuario } = usuario;
  return datosUsuario;
}

// Actualiza los datos del perfil
export async function actualizarPerfil(idUsuario, { nombre, apellido, telefono, direccion }) {
  const result = await db.execute({
    sql: `UPDATE usuarios
          SET nombre = ?, apellido = ?, telefono = ?, direccion = ?, actualizado_en = datetime('now')
          WHERE id = ? AND activo = 1
          RETURNING id, nombre, apellido, correo, telefono, direccion, rol, activo, creado_en, actualizado_en`,
    args: [nombre, apellido, telefono, direccion, idUsuario],
  });
  return result.rows[0] || null;
}

// Cambia la contrasena del usuario autenticado
export async function cambiarContrasena(idUsuario, contrasenaActual, contrasenaNueva) {
  // Obtener la contrasena actual del usuario
  const resultUsuario = await db.execute({
    sql: "SELECT contrasena_hash FROM usuarios WHERE id = ? AND activo = 1 LIMIT 1",
    args: [idUsuario],
  });
  
  const usuario = resultUsuario.rows[0];
  if (!usuario) {
    return { error: "Usuario no encontrado o inactivo" };
  }
  
  const esValida = await Bun.password.verify(contrasenaActual, usuario.contrasena_hash);
  if (!esValida) {
    return { error: "La contrasena actual es incorrecta" };
  }
  
  const nuevoHash = await Bun.password.hash(contrasenaNueva);
  await db.execute({
    sql: "UPDATE usuarios SET contrasena_hash = ?, actualizado_en = datetime('now') WHERE id = ?",
    args: [nuevoHash, idUsuario],
  });
  
  return { success: true };
}

// Crea un nuevo administrador
export async function crearAdministrador({ nombre, apellido, correo, contrasena, telefono = null, direccion = null }) {
  const contrasenaHash = await Bun.password.hash(contrasena);
  
  const result = await db.execute({
    sql: `INSERT INTO usuarios (nombre, apellido, correo, contrasena_hash, telefono, direccion, rol, activo)
          VALUES (?, ?, ?, ?, ?, ?, 'administrador', 1)
          RETURNING id, nombre, apellido, correo, telefono, direccion, rol, activo, creado_en, actualizado_en`,
    args: [nombre, apellido, correo, contrasenaHash, telefono, direccion],
  });
  
  return result.rows[0];
}
