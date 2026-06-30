import { Elysia } from "elysia";

// Middleware para verificar que el usuario este autenticado con un JWT valido
export const authMiddleware = new Elysia({ name: "auth-middleware" })
  .derive(async ({ jwt, headers, set }) => {
    const authHeader = headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      set.status = 401;
      throw new Error("No autorizado: Token no proporcionado");
    }
    
    const token = authHeader.split(" ")[1];
    const payload = await jwt.verify(token);
    if (!payload) {
      set.status = 401;
      throw new Error("No autorizado: Token invalido o expirado");
    }
    
    // Retornamos el payload decodificado del usuario para que este disponible en las rutas
    return {
      usuario: payload,
    };
  });

// Middleware para restringir el acceso solo a administradores
export const adminOnlyMiddleware = new Elysia({ name: "admin-middleware" })
  .use(authMiddleware)
  .derive(({ usuario, set }) => {
    if (usuario.rol !== "administrador") {
      set.status = 403;
      throw new Error("Forbidden: Se requieren permisos de administrador");
    }
    return {};
  });
