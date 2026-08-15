import { EventEmitter } from "node:events";
import { publicarEventoWebSocket } from "../services/websocket.service.js";

/**
 * Bus de eventos centralizado para notificaciones en tiempo real del estado de los pedidos.
 * Emite localmente y transmite automáticamente a todos los clientes WebSocket conectados.
 */
export const orderEvents = new EventEmitter();
orderEvents.setMaxListeners(500);

// Interceptar llamadas a emit para transmitir automáticamente todos los eventos a WebSocket
const originalEmit = orderEvents.emit.bind(orderEvents);
orderEvents.emit = function (event, data) {
  if (event === "pedido_actualizado" && data) {
    publicarEventoWebSocket(data).catch((err) => {
      console.error("❌ Error transmitiendo evento de pedido a WebSocket:", err.message);
    });
  }
  return originalEmit(event, data);
};

