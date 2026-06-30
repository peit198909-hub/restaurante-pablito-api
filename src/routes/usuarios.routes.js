import { Elysia, t } from "elysia";
import * as service from "../services/usuarios.service.js";
import { logActividad } from "../utils/logger.js";

export const usuariosRoutes = new Elysia({ prefix: "/api/usuarios" })
  // 1. Registro de clientes (publico)
  .post("/registro", async ({ body, jwt, request, set }) => {
    // Validar si el correo ya existe
    const existente = await service.buscarUsuarioPorCorreo(body.correo);
    if (existente) {
      set.status = 409;
      return { status: "error", message: "El correo electronico ya esta registrado" };
    }
    
    // Crear el cliente
    const nuevoUsuario = await service.registrarCliente(body);
    
    // Generar token JWT
    const token = await jwt.sign({
      id: nuevoUsuario.id,
      correo: nuevoUsuario.correo,
      rol: nuevoUsuario.rol,
    });
    
    // Registrar log
    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
    await logActividad(nuevoUsuario.id, "REGISTRO", "Registro de nuevo cliente", ip);
    
    return {
      status: "success",
      message: "Registro completado con exito",
      token,
      usuario: nuevoUsuario,
    };
  }, {
    body: t.Object({
      nombre: t.String({ minLength: 2 }),
      apellido: t.String({ minLength: 2 }),
      correo: t.String(),
      contrasena: t.String({ minLength: 6 }),
      telefono: t.Optional(t.String()),
      direccion: t.Optional(t.String()),
    })
  })
  
  // 2. Login de usuarios (publico)
  .post("/login", async ({ body, jwt, request, set }) => {
    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
    
    // Intentar verificar credenciales
    const usuario = await service.verificarCredenciales(body.correo, body.contrasena);
    
    if (!usuario) {
      // Registrar log de login fallido
      const usr = await service.buscarUsuarioPorCorreo(body.correo);
      await logActividad(usr ? usr.id : null, "LOGIN_FALLIDO", `Intento de acceso fallido para correo: ${body.correo}`, ip);
      
      set.status = 401;
      return { status: "error", message: "Credenciales invalidas o cuenta inactiva" };
    }
    
    if (usuario.inactivo) {
      set.status = 401;
      return { status: "error", message: "Credenciales invalidas o cuenta inactiva" };
    }
    
    // Generar token
    const token = await jwt.sign({
      id: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol,
    });
    
    // Registrar log de acceso exitoso
    await logActividad(usuario.id, "LOGIN", "Inicio de sesion exitoso", ip);
    
    return {
      status: "success",
      message: "Inicio de sesion exitoso",
      token,
      usuario,
    };
  }, {
    body: t.Object({
      correo: t.String(),
      contrasena: t.String(),
    })
  })
  
  // Grupo protegido (requiere token valido)
  .guard({
    beforeHandle: async ({ jwt, headers, set }) => {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { status: "error", message: "No autorizado: Token no proporcionado" };
      }
      
      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);
      if (!payload) {
        set.status = 401;
        return { status: "error", message: "No autorizado: Token invalido o expirado" };
      }
    }
  }, (app) => app
    // 3. Obtener perfil del usuario autenticado
    .get("/perfil", async ({ headers, jwt, set }) => {
      const authHeader = headers["authorization"];
      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);
      
      const usr = await service.buscarUsuarioPorCorreo(payload.correo);
      if (!usr || usr.activo !== 1) {
        set.status = 404;
        return { status: "error", message: "Usuario no encontrado o inactivo" };
      }
      
      const { contrasena_hash, ...datosPerfil } = usr;
      return {
        status: "success",
        usuario: datosPerfil,
      };
    })
    
    // 4. Modificar perfil del usuario autenticado
    .put("/perfil", async ({ body, headers, jwt, request, set }) => {
      const authHeader = headers["authorization"];
      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);
      const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
      
      // Si se incluye cambio de contrasena, procesarlo
      if (body.contrasenaNueva) {
        if (!body.contrasenaActual) {
          set.status = 400;
          return { status: "error", message: "Debe ingresar la contrasena actual para cambiarla" };
        }
        
        const cambioResult = await service.cambiarContrasena(payload.id, body.contrasenaActual, body.contrasenaNueva);
        if (cambioResult.error) {
          set.status = 400;
          return { status: "error", message: cambioResult.error };
        }
      }
      
      // Actualizar datos de perfil
      const perfilActualizado = await service.actualizarPerfil(payload.id, {
        nombre: body.nombre,
        apellido: body.apellido,
        telefono: body.telefono || null,
        direccion: body.direccion || null,
      });
      
      if (!perfilActualizado) {
        set.status = 404;
        return { status: "error", message: "Usuario no encontrado o inactivo" };
      }
      
      await logActividad(payload.id, "ACTUALIZAR_PERFIL", "Actualizacion de perfil exitosa", ip);
      
      return {
        status: "success",
        message: "Perfil actualizado con exito",
        usuario: perfilActualizado,
      };
    }, {
      body: t.Object({
        nombre: t.String({ minLength: 2 }),
        apellido: t.String({ minLength: 2 }),
        telefono: t.Optional(t.String()),
        direccion: t.Optional(t.String()),
        contrasenaActual: t.Optional(t.String()),
        contrasenaNueva: t.Optional(t.String({ minLength: 6 })),
      })
    })
    
    // Sub-grupo protegido exclusivo de administrador (solo admins)
    .guard({
      beforeHandle: async ({ jwt, headers, set }) => {
        const authHeader = headers["authorization"];
        const token = authHeader.split(" ")[1];
        const payload = await jwt.verify(token);
        if (payload.rol !== "administrador") {
          set.status = 403;
          return { status: "error", message: "Forbidden: Se requieren permisos de administrador" };
        }
      }
    }, (subApp) => subApp
      // 5. Crear cuenta de administrador
      .post("/admin/crear", async ({ body, headers, jwt, request, set }) => {
        const authHeader = headers["authorization"];
        const token = authHeader.split(" ")[1];
        const payload = await jwt.verify(token);
        const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
        
        // Validar si el correo ya existe
        const existente = await service.buscarUsuarioPorCorreo(body.correo);
        if (existente) {
          set.status = 409;
          return { status: "error", message: "El correo electronico ya esta registrado" };
        }
        
        // Crear el administrador nuevo
        const nuevoAdmin = await service.crearAdministrador(body);
        
        // Registrar log
        await logActividad(
          nuevoAdmin.id,
          "CREAR_ADMIN",
          `Administrador creado por el usuario administrador con ID ${payload.id}`,
          ip
        );
        
        return {
          status: "success",
          message: "Administrador creado con exito",
          usuario: nuevoAdmin,
        };
      }, {
        body: t.Object({
          nombre: t.String({ minLength: 2 }),
          apellido: t.String({ minLength: 2 }),
          correo: t.String(),
          contrasena: t.String({ minLength: 6 }),
          telefono: t.Optional(t.String()),
          direccion: t.Optional(t.String()),
        })
      })
    )
  );
