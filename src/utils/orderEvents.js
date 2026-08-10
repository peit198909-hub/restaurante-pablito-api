import { EventEmitter } from "node:events";
import { publicarEventoPedido } from "../services/pusher.service.js";

/**
 * Bus de eventos centralizado para notificaciones en tiempo real del estado de los pedidos.
 * Emite localmente (SSE) y transmite automáticamente a Pusher Channels.
 */
export const orderEvents = new EventEmitter();
orderEvents.setMaxListeners(500);

// Interceptar llamadas a emit para transmitir automáticamente todos los eventos a Pusher
const originalEmit = orderEvents.emit.bind(orderEvents);
orderEvents.emit = function (event, data) {
  if (event === "pedido_actualizado" && data) {
    publicarEventoPedido(data).catch((err) => {
      console.error("❌ Error transmitiendo evento de pedido a Pusher:", err.message);
    });
  }
  return originalEmit(event, data);
};
