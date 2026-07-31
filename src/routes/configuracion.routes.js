import { Elysia, t } from "elysia";
import * as service from "../services/configuracion.service.js";

export const configuracionRoutes = new Elysia({ prefix: "/api/configuracion" })
  // 1. Obtener la configuración actual y el estado de atención del local (Público)
  .get("/", async () => {
    const config = await service.obtenerConfiguracion();
    const abierto = service.estaAbierto(config);

    return {
      status: "success",
      configuracion: config,
      esta_abierto: abierto,
    };
  })

  // 2. Actualizar configuración del local (Protegido solo para Administradores)
  .guard(
    {
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
          return { status: "error", message: "No autorizado: Token inválido o expirado" };
        }

        if (payload.rol !== "administrador") {
          set.status = 403;
          return { status: "error", message: "Forbidden: Se requieren permisos de administrador" };
        }
      },
    },
    (app) =>
      app.put("/", async ({ body, set }) => {
        try {
          const configActualizada = await service.actualizarConfiguracion(body);
          const abierto = service.estaAbierto(configActualizada);

          return {
            status: "success",
            message: "Configuración del negocio actualizada con éxito",
            configuracion: configActualizada,
            esta_abierto: abierto,
          };
        } catch (err) {
          set.status = 500;
          return { status: "error", message: err.message || "Error al actualizar la configuración" };
        }
      })
  );
