import Pusher from "pusher";

// Inicializar cliente Pusher REST en modo lazy (solo se crea cuando se necesita)
let pusherClient = null;

/**
 * Obtiene (o crea) la instancia de Pusher REST para publicar eventos desde el servidor.
 * Usa patrón singleton para evitar múltiples instancias en entornos serverless.
 */
export function getPusherServer() {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER || "us2";

  if (!appId || !key || !secret) {
    console.warn("⚠️ Advertencia: Variables de Pusher no están definidas en las variables de entorno (PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET).");
    return null;
  }

  // Re-crear si las variables cambiaron (útil en Serverless/Vercel)
  if (!pusherClient) {
    try {
      pusherClient = new Pusher({
        appId,
        key,
        secret,
        cluster,
        useTLS: true,
      });
      console.log("⚡ Pusher servidor inicializado correctamente.");
    } catch (err) {
      console.error("❌ Error inicializando Pusher servidor:", err.message);
      return null;
    }
  }

  return pusherClient;
}

/**
 * Publica un evento de pedido en el canal de Pusher.
 * El canal 'restaurante-pablito-pedidos' y el evento 'pedido_actualizado'
 * son escuchados por todos los clientes suscritos (admin, repartidores, clientes).
 *
 * @param {Object} eventoData - Datos del evento (tipo, pedido_id, estado, etc.)
 */
export async function publicarEventoPedido(eventoData) {
  try {
    const client = getPusherServer();
    if (!client) {
      console.warn("⚠️ No se pudo publicar evento: Pusher no está disponible.");
      return;
    }

    await client.trigger("restaurante-pablito-pedidos", "pedido_actualizado", eventoData);
    console.log(
      "⚡ Evento publicado con éxito en Pusher:",
      eventoData.tipo || "actualizado",
      `Pedido #${eventoData.pedido_id}`
    );
  } catch (err) {
    console.error("❌ Error publicando evento en Pusher:", err.message);
  }
}
