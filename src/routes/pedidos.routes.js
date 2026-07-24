import { Elysia, t } from "elysia";
import * as service from "../services/pedidos.service.js";

export const pedidosRoutes = new Elysia({ prefix: "/api/pedidos" })
  // Grupo protegido para usuarios autenticados (clientes y administradores)
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
    // 1. Crear nuevo pedido (cliente / admin)
    .post("/", async ({ body, headers, jwt, set }) => {
      const authHeader = headers["authorization"];
      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);

      const resultado = await service.crearPedido({
        usuario_id: payload.id,
        items: body.items,
        direccion_entrega: body.direccion_entrega,
        telefono_contacto: body.telefono_contacto,
        notas: body.notas,
        metodo_pago: body.metodo_pago,
      });

      if (resultado.errorStatus) {
        set.status = resultado.errorStatus;
        return { status: "error", message: resultado.message };
      }

      set.status = 201;
      return {
        status: "success",
        message: "Pedido creado con exito",
        pedido: resultado.pedido,
        items: resultado.items,
      };
    }, {
      body: t.Object({
        items: t.Array(
          t.Object({
            producto_id: t.Number(),
            cantidad: t.Number({ minimum: 1 }),
            notas: t.Optional(t.String()),
          })
        ),
        direccion_entrega: t.Optional(t.String()),
        telefono_contacto: t.Optional(t.String()),
        notas: t.Optional(t.String()),
        metodo_pago: t.Optional(t.String()),
      })
    })

    // 2. Obtener historial de mis pedidos (cliente autenticado)
    .get("/mis-pedidos", async ({ headers, jwt }) => {
      const authHeader = headers["authorization"];
      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);

      const pedidos = await service.obtenerPedidosCliente(payload.id);
      return { status: "success", pedidos };
    })

    // Sub-grupo exclusivo para administradores
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
    }, (adminApp) => adminApp
      // 3. Listar todos los pedidos (solo admin)
      .get("/", async ({ query }) => {
        const estado = query.estado || null;
        const fecha = query.fecha || null;
        const pedidos = await service.obtenerTodosPedidosAdmin(estado, fecha);
        return { status: "success", pedidos };
      })

      // 4. Cambiar estado de un pedido (solo admin)
      .patch("/:id/estado", async ({ params, body, set }) => {
        const id = parseInt(params.id, 10);
        if (isNaN(id)) {
          set.status = 400;
          return { status: "error", message: "ID de pedido invalido" };
        }

        const resultado = await service.cambiarEstadoPedido(id, body.estado);
        if (resultado.errorStatus) {
          set.status = resultado.errorStatus;
          return { status: "error", message: resultado.message };
        }

        return {
          status: "success",
          message: `Estado del pedido actualizando a '${body.estado}'`,
          pedido: resultado.pedido,
        };
      }, {
        body: t.Object({
          estado: t.String(),
        })
      })
    )

    // 5. Obtener detalle/seguimiento de un pedido por ID (cliente propietario o admin)
    .get("/:id", async ({ params, headers, jwt, set }) => {
      const id = parseInt(params.id, 10);
      if (isNaN(id)) {
        set.status = 400;
        return { status: "error", message: "ID de pedido invalido" };
      }

      const authHeader = headers["authorization"];
      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);

      const esAdmin = payload.rol === "administrador";
      const resultado = await service.obtenerDetallePedido(id, payload.id, esAdmin);

      if (resultado.errorStatus) {
        set.status = resultado.errorStatus;
        return { status: "error", message: resultado.message };
      }

      return {
        status: "success",
        pedido: resultado.pedido,
        items: resultado.items,
        historial: resultado.historial,
      };
    })
  );
