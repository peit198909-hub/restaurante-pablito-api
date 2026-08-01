import { Elysia, t } from "elysia";
import { subirImagen } from "../services/cloudinary.service.js";

export const uploadRoutes = new Elysia({ prefix: "/api/upload" })
  // ====================================================================
  // 1. Subir imagen de producto (solo administradores)
  // ====================================================================
  .post("/producto", async ({ body, headers, jwt, set }) => {
    // Verificar autenticación y rol de administrador
    const authHeader = headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      set.status = 401;
      return { status: "error", message: "No autorizado: Token no proporcionado" };
    }

    const token = authHeader.split(" ")[1];
    const payload = await jwt.verify(token);
    if (!payload) {
      set.status = 401;
      return { status: "error", message: "No autorizado: Token inválido o expirado" };
    }

    if (payload.rol !== "administrador") {
      set.status = 403;
      return { status: "error", message: "Forbidden: Se requieren permisos de administrador" };
    }

    // Subir imagen a Cloudinary en la carpeta 'platos'
    try {
      const resultado = await subirImagen(body.imagen, "platos");
      return {
        status: "success",
        message: "Imagen de producto subida con éxito",
        url: resultado.url,
        public_id: resultado.public_id,
      };
    } catch (error) {
      set.status = error.message.includes("5 MB") ? 422 : 500;
      return { status: "error", message: error.message };
    }
  }, {
    body: t.Object({
      imagen: t.String({ description: "Imagen en formato base64 (data:image/...) o URL pública" }),
    })
  })

  // ====================================================================
  // 2. Subir comprobante de transferencia (clientes autenticados)
  // ====================================================================
  .post("/comprobante", async ({ body, headers, jwt, set }) => {
    // Verificar autenticación (cualquier usuario autenticado)
    const authHeader = headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      set.status = 401;
      return { status: "error", message: "No autorizado: Token no proporcionado" };
    }

    const token = authHeader.split(" ")[1];
    const payload = await jwt.verify(token);
    if (!payload) {
      set.status = 401;
      return { status: "error", message: "No autorizado: Token inválido o expirado" };
    }

    // Subir imagen a Cloudinary en la carpeta 'comprobantes'
    try {
      const resultado = await subirImagen(body.imagen, "comprobantes");
      return {
        status: "success",
        message: "Comprobante de transferencia subido con éxito",
        url: resultado.url,
        public_id: resultado.public_id,
      };
    } catch (error) {
      set.status = error.message.includes("5 MB") ? 422 : 500;
      return { status: "error", message: error.message };
    }
  }, {
    body: t.Object({
      imagen: t.String({ description: "Imagen del comprobante en formato base64 (data:image/...)" }),
    })
  });
