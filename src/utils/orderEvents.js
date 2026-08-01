import { EventEmitter } from "node:events";
import { publicarEventoPedido } from "../services/ably.service.js";

/**
 * Bus de eventos centralizado para notificaciones en tiempo real del estado de los pedidos.
 * Emite localmente (SSE) y transmite automáticamente a Ably Realtime.
 */
export const orderEvents = new EventEmitter();
orderEvents.setMaxListeners(500);

// Interceptar llamadas a emit para transmitir automáticamente todos los eventos a Ably Realtime
const originalEmit = orderEvents.emit.bind(orderEvents);
orderEvents.emit = function (event, data) {
  if (event === "pedido_actualizado" && data) {
    publicarEventoPedido(data).catch((err) => {
      console.error("❌ Error transmitiendo evento de pedido a Ably:", err.message);
    });
  }
  return originalEmit(event, data);
};
