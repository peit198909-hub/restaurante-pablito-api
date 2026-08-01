import Ably from "ably";

let ablyClient = null;

export function getAblyClient() {
  if (!ablyClient) {
    const apiKey = process.env.ABLY_API_KEY || "RL2lOg.7FTCLg:r8vCLHJFQ6-2mpcAcGLiUG7g5EjNMhe0YGplmlf9U94";
    try {
      ablyClient = new Ably.Realtime({ key: apiKey });
      console.log("⚡ Ably Realtime inicializado en el servidor backend.");
    } catch (err) {
      console.error("❌ Error inicializando Ably Realtime:", err.message);
    }
  }
  return ablyClient;
}

export async function publicarEventoPedido(eventoData) {
  try {
    const client = getAblyClient();
    if (!client) return;

    const channel = client.channels.get("restaurante-pablito-pedidos");
    await channel.publish("pedido_actualizado", eventoData);
    console.log("⚡ Evento publicado en Ably Realtime:", eventoData.tipo || "actualizado", `Pedido #${eventoData.pedido_id}`);
  } catch (err) {
    console.error("❌ Error publicando evento en Ably:", err.message);
  }
}
