import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { usuariosRoutes } from "./routes/usuarios.routes.js";
import { productosRoutes } from "./routes/productos.routes.js";
import { pedidosRoutes } from "./routes/pedidos.routes.js";
import { repartidoresRoutes } from "./routes/repartidores.routes.js";
import { configuracionRoutes } from "./routes/configuracion.routes.js";
import { migrateConfig } from "./db/migrate_config.js";

// Ejecutar migración de la tabla de configuración de forma segura sin bloquear la inicialización
migrateConfig().catch((err) => {
  console.warn("Advertencia al ejecutar migración de configuración:", err);
});

// Leer variables de entorno
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET || "clave_secreta_jwt_temporal";
const jwtExpiry = process.env.JWT_EXPIRY || "24h";

// Inicializar aplicación Elysia
const app = new Elysia()
  .use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  )
  .use(
    jwt({
      name: "jwt",
      secret: jwtSecret,
      exp: jwtExpiry,
    })
  )
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      const erroresDetalle = error.all
        ? error.all.map((err) => `${err.path.substring(1)}: ${err.message}`).join(", ")
        : error.message;
      return {
        status: "error",
        message: `Datos de entrada inválidos: ${erroresDetalle}`,
      };
    }

    if (error.message.startsWith("No autorizado") || error.message.startsWith("No autenticado")) {
      set.status = 401;
      return { status: "error", message: error.message };
    }

    if (error.message.startsWith("Forbidden")) {
      set.status = 403;
      return { status: "error", message: error.message };
    }

    set.status = set.status || 500;
    return {
      status: "error",
      message: error.message || "Ocurrió un error inesperado en el servidor",
    };
  })
  .use(usuariosRoutes)
  .use(productosRoutes)
  .use(pedidosRoutes)
  .use(repartidoresRoutes)
  .use(configuracionRoutes)
  .get("/", () => ({
    status: "success",
    message: "Servidor de Restaurante Pablito API ejecutándose correctamente en JavaScript",
  }));

// Solo escuchar en puerto si estamos en entorno de desarrollo local
if (!process.env.VERCEL) {
  app.listen(port);
  console.log(`Servidor de la API del Restaurante Pablito activo en: http://localhost:${port}`);
}

// Adaptador para Vercel Serverless Functions (Soporte dual req/res Node.js y Web Request/Fetch)
export default async function handler(req, res) {
  // Si req es un Web Request estándar (Bun / Edge / Fetch)
  if (req && typeof req.text === "function") {
    return app.handle(req);
  }

  // Si req/res es el modelo HTTP de Node.js (Vercel Serverless Function)
  if (res && typeof res.setHeader === "function") {
    try {
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
      const fullUrl = `${protocol}://${host}${req.url}`;

      let body = undefined;
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        const buffers = [];
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        body = Buffer.concat(buffers);
      }

      const webRequest = new Request(fullUrl, {
        method: req.method,
        headers: req.headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
      });

      const response = await app.handle(webRequest);

      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      if (response.body) {
        const arrayBuffer = await response.arrayBuffer();
        res.end(Buffer.from(arrayBuffer));
      } else {
        res.end();
      }
      return;
    } catch (err) {
      console.error("Vercel Function Error:", err);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "error", message: err.message || "Internal Server Error" }));
      return;
    }
  }

  // Fallback por defecto
  return app.fetch ? app.fetch(req) : app.handle(req);
}
