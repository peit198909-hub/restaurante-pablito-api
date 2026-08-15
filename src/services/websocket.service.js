// Set para registrar todas las conexiones WebSocket activas
const activeClients = new Set();

/**
 * Registra un cliente WebSocket recién conectado.
 */
export function handleWSConnect(ws) {
  activeClients.add(ws);
  console.log(`⚡ WebSocket: Nuevo cliente conectado. Total conectados: ${activeClients.size}`);

  // Enviar confirmación de handshake
  try {
    ws.send(
      JSON.stringify({
        event: "conexion",
        data: { message: "Conectado exitosamente al servidor WebSocket del Restaurante Pablito" },
      })
    );
  } catch (err) {
    console.error("Error enviando handshake inicial WebSocket:", err);
  }
}

/**
 * Maneja mensajes entrantes enviados por los clientes.
 */
export function handleWSMessage(ws, message) {
  try {
    const parsed = typeof message === "string" ? JSON.parse(message) : message;
    if (parsed?.type === "ping") {
      ws.send(JSON.stringify({ event: "pong", timestamp: Date.now() }));
    }
  } catch (e) {
    // Ignorar si el formato no es JSON
  }
}

/**
 * Remueve un cliente WebSocket al desconectarse.
 */
export function handleWSClose(ws) {
  activeClients.delete(ws);
  console.log(`🔌 WebSocket: Cliente desconectado. Total conectados: ${activeClients.size}`);
}

/**
 * Transmite un evento de pedido en tiempo real a todos los clientes WebSocket conectados.
 * @param {Object} eventoData - Datos del evento (tipo, pedido_id, estado, etc.)
 */
export async function publicarEventoWebSocket(eventoData) {
  if (activeClients.size === 0) {
    console.log("ℹ️ No hay clientes WebSocket conectados activos en este momento.");
    return;
  }

  const payload = JSON.stringify({
    event: "pedido_actualizado",
    data: eventoData,
  });

  let conectados = 0;
  for (const client of activeClients) {
    try {
      client.send(payload);
      conectados++;
    } catch (err) {
      console.error("❌ Error enviando mensaje a cliente WebSocket:", err.message);
      activeClients.delete(client);
    }
  }

  console.log(
    "⚡ Evento publicado con éxito vía WebSocket:",
    eventoData.tipo || "actualizado",
    `Pedido #${eventoData.pedido_id} -> ${conectados} cliente(s) notificado(s)`
  );
}
