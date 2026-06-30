import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { usuariosRoutes } from "./routes/usuarios.routes.js";

// Leer variables de entorno
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || "clave_secreta_jwt_temporal";
const jwtExpiry = process.env.JWT_EXPIRY || "24h";

// Inicializar aplicacion Elysia
const app = new Elysia()
  // Habilitar CORS para permitir llamadas del frontend
  .use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  )
  // Configurar plugin JWT para autenticacion
  .use(
    jwt({
      name: "jwt",
      secret: jwtSecret,
      exp: jwtExpiry,
    })
  )
  // Manejo de errores global y estandarizado
  .onError(({ code, error, set }) => {
    // Si falla la validacion de esquema de Elysia (TypeBox)
    if (code === "VALIDATION") {
      set.status = 400;
      const erroresDetalle = error.all
        ? error.all.map((err) => `${err.path.substring(1)}: ${err.message}`).join(", ")
        : error.message;
      return {
        status: "error",
        message: `Datos de entrada invalidos: ${erroresDetalle}`,
      };
    }
    
    // Si es un error de autenticacion
    if (error.message.startsWith("No autorizado") || error.message.startsWith("No autenticado")) {
      set.status = 401;
      return { status: "error", message: error.message };
    }
    
    // Si es un error de rol insuficiente
    if (error.message.startsWith("Forbidden")) {
      set.status = 403;
      return { status: "error", message: error.message };
    }
    
    // Error generico
    set.status = set.status || 500;
    return {
      status: "error",
      message: error.message || "Ocurrio un error inesperado en el servidor",
    };
  })
  // Registrar modulo de usuarios
  .use(usuariosRoutes)
  // Endpoint de salud basico
  .get("/", () => ({
    status: "success",
    message: "Servidor de Restaurante Pablito API ejecutandose correctamente en JavaScript",
  }))
  .listen(port);

console.log(`Servidor de la API del Restaurante Pablito activo en: http://localhost:${port}`);
export default app;
