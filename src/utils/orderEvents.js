import { EventEmitter } from "node:events";

/**
 * Bus de eventos centralizado para notificaciones en tiempo real del estado de los pedidos.
 * Permite emitir y escuchar cambios de pedidos entre los servicios y la conexion SSE.
 */
export const orderEvents = new EventEmitter();

// Incrementar el limite maximo de oyentes para soportar múltiples conexiones SSE simultaneas
orderEvents.setMaxListeners(200);
