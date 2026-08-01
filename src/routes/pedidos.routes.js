import { Elysia, t } from "elysia";
import * as service from "../services/pedidos.service.js";
import { orderEvents } from "../utils/orderEvents.js";

export const pedidosRoutes = new Elysia({ prefix: "/api/pedidos" })
  // Endpoint de Server-Sent Events (SSE) en tiempo real para seguimiento de pedidos
  .get("/stream", async ({ query, headers, jwt, set }) => {
    // Extraer token desde header Authorization o desde parametro de consulta ?token=
    const authHeader = headers["authorization"];
    let token = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (query && query.token) {
      token = query.token;
    }

    if (!token) {
      set.status = 401;
      return { status: "error", message: "Token no proporcionado para conexion SSE" };
    }

    const payload = await jwt.verify(token);
    if (!payload) {
      set.status = 401;
      return { status: "error", message: "Token invalido o expirado para conexion SSE" };
    }

    const usuarioId = payload.id;
    const esAdmin = payload.rol === "administrador";

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        const sendEvent = (event, data) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch (err) {
            // El stream se ha cerrado
          }
        };

        // Enviar handshake inicial
        sendEvent("conexion", {
          status: "conectado",
          message: "Conexión SSE establecida con éxito",
          usuarioId,
          esAdmin,
        });

        // Intervalo de ping/heartbeat cada 15 segundos para mantener viva la conexión HTTP
        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch (err) {
            clearInterval(pingInterval);
          }
        }, 15000);

        // Escuchar eventos de pedidos
        const listener = (data) => {
          // Filtrar: Los administradores reciben todos los eventos; los clientes solo sus propios pedidos
          if (esAdmin || data.usuario_id === usuarioId) {
            sendEvent("pedido_actualizado", data);
          }
        };

        orderEvents.on("pedido_actualizado", listener);

        // Guardar referencia de desuscripcion y limpieza
        controller._cleanup = () => {
          clearInterval(pingInterval);
          orderEvents.removeListener("pedido_actualizado", listener);
        };
      },
      cancel(controller) {
        if (controller && typeof controller._cleanup === "function") {
          controller._cleanup();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "X-Accel-Buffering": "no",
      },
    });
  })
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
    // Endpoint para métricas y KPIs del Dashboard del Administrador
    .get("/dashboard", async ({ headers, jwt, set }) => {
      const authHeader = headers["authorization"];
      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);

      if (!payload || payload.rol !== "administrador") {
        set.status = 403;
        return { status: "error", message: "Forbidden: Se requieren permisos de administrador" };
      }

      const metricas = await service.obtenerMetricasDashboard();
      return { status: "success", metricas };
    })

    // Endpoint para entrega activa del repartidor autenticado
    .get("/repartidor/activo", async ({ headers, jwt, set }) => {
      const authHeader = headers["authorization"];
      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);

      if (!payload || (payload.rol !== "repartidor" && payload.rol !== "administrador")) {
        set.status = 403;
        return { status: "error", message: "Se requieren permisos de repartidor" };
      }

      const res = await service.obtenerEntregaActivaRepartidor(payload.id);
      return { status: "success", entrega: res };
    })

    // Endpoint para cambiar estado de entrega por repartidor (en_camino / entregado)
    .patch("/repartidor/estado", async ({ body, headers, jwt, set }) => {
      const authHeader = headers["authorization"];
      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);

      if (!payload || (payload.rol !== "repartidor" && payload.rol !== "administrador")) {
        set.status = 403;
        return { status: "error", message: "Se requieren permisos de repartidor" };
      }

      const res = await service.cambiarEstadoPorRepartidor(body.pedido_id, payload.id, body.estado);
      if (res.errorStatus) {
        set.status = res.errorStatus;
        return { status: "error", message: res.message };
      }

      return {
        status: "success",
        message: `Estado de entrega actualizado a '${body.estado}'`,
        pedido: res.pedido,
      };
    }, {
      body: t.Object({
        pedido_id: t.Number(),
        estado: t.String(),
      })
    })

    // Endpoint para historial de entregas completadas del repartidor
    .get("/repartidor/historial", async ({ query, headers, jwt, set }) => {
      const authHeader = headers["authorization"];
      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);

      if (!payload || (payload.rol !== "repartidor" && payload.rol !== "administrador")) {
        set.status = 403;
        return { status: "error", message: "Se requieren permisos de repartidor" };
      }

      const res = await service.obtenerHistorialEntregasRepartidor(payload.id, query.page, query.limit);
      return { status: "success", ...res };
    })

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
        distancia_km: body.distancia_km,
        comprobante_url: body.comprobante_url,
        tipo_entrega: body.tipo_entrega,
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
        direccion_entrega: t.Optional(t.Union([t.String(), t.Null()])),
        telefono_contacto: t.Optional(t.Union([t.String(), t.Null()])),
        notas: t.Optional(t.Union([t.String(), t.Null()])),
        metodo_pago: t.Optional(t.Union([t.String(), t.Null()])),
        distancia_km: t.Optional(t.Union([t.Number(), t.Null()])),
        comprobante_url: t.Optional(t.Union([t.String(), t.Null()])),
        tipo_entrega: t.Optional(t.Union([t.String(), t.Null()])),
      })
    })

    // 1.5 Adjuntar comprobante de transferencia a un pedido existente
    .patch("/:id/comprobante", async ({ params, body, headers, jwt, set }) => {
      const id = parseInt(params.id, 10);
      if (isNaN(id)) {
        set.status = 400;
        return { status: "error", message: "ID de pedido invalido" };
      }

      const authHeader = headers["authorization"];
      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);

      const resultado = await service.adjuntarComprobante(id, payload.id, body.comprobante_url);

      if (resultado.errorStatus) {
        set.status = resultado.errorStatus;
        return { status: "error", message: resultado.message };
      }

      return {
        status: "success",
        message: "Comprobante de transferencia adjuntado con éxito",
        pedido: resultado.pedido,
      };
    }, {
      body: t.Object({
        comprobante_url: t.String(),
      })
    })

    // 2. Obtener historial de mis pedidos (cliente autenticado con paginacion)
    .get("/mis-pedidos", async ({ query, headers, jwt }) => {
      const authHeader = headers["authorization"];
      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);

      const res = await service.obtenerPedidosCliente(payload.id, query.page, query.limit);
      return { status: "success", ...res };
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
      // 3. Listar todos los pedidos (solo admin con paginacion)
      .get("/", async ({ query }) => {
        const estado = query.estado || null;
        const fecha = query.fecha || null;
        const res = await service.obtenerTodosPedidosAdmin(estado, fecha, query.page, query.limit);
        return { status: "success", ...res };
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
