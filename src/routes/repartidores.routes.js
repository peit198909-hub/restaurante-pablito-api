import { Elysia, t } from "elysia";
import * as service from "../services/repartidores.service.js";

export const repartidoresRoutes = new Elysia({ prefix: "/api/repartidores" })
  // Guard administrativo para rutas de repartidores
  .guard({
    beforeHandle: async ({ jwt, headers, set }) => {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { status: "error", message: "No autorizado: Token no proporcionado" };
      }

      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);
      if (!payload || payload.rol !== "administrador") {
        set.status = 403;
        return { status: "error", message: "Forbidden: Permisos de administrador requeridos" };
      }
    },
  }, (app) =>
    app
      // 1. Obtener lista de repartidores
      .get("/", async ({ query }) => {
        const soloActivos = query.activos === "true";
        const repartidores = await service.obtenerRepartidores(soloActivos);
        return { status: "success", repartidores };
      })

      // 2. Crear un nuevo repartidor
      .post("/", async ({ body, set }) => {
        const nuevo = await service.crearRepartidor(body);
        set.status = 201;
        return { status: "success", message: "Repartidor registrado con éxito", repartidor: nuevo };
      }, {
        body: t.Object({
          nombre: t.String({ minLength: 2 }),
          apellido: t.String({ minLength: 2 }),
          telefono_whatsapp: t.String({ minLength: 7 }),
          tipo_vehiculo: t.Optional(t.String()),
          placa_vehiculo: t.Optional(t.String()),
        }),
      })

      // 3. Editar repartidor
      .put("/:id", async ({ params, body, set }) => {
        const id = parseInt(params.id, 10);
        const editado = await service.editarRepartidor(id, body);
        if (!editado) {
          set.status = 404;
          return { status: "error", message: "Repartidor no encontrado" };
        }
        return { status: "success", message: "Repartidor actualizado", repartidor: editado };
      })

      // 4. Cambiar disponibilidad/activo
      .patch("/:id/activo", async ({ params, body, set }) => {
        const id = parseInt(params.id, 10);
        const actualizado = await service.cambiarEstadoRepartidor(id, body.activo);
        if (!actualizado) {
          set.status = 404;
          return { status: "error", message: "Repartidor no encontrado" };
        }
        return { status: "success", message: "Estado de repartidor actualizado", repartidor: actualizado };
      })
  );
