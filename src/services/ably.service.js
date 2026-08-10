import Ably from "ably";

let ablyRest = null;

export function getAblyRest() {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ Advertencia: ABLY_API_KEY no está definida en las variables de entorno.");
    return null;
  }

  if (!ablyRest) {
    try {
      ablyRest = new Ably.Rest({ key: apiKey });
      console.log("⚡ Ably REST client inicializado en el servidor backend.");
    } catch (err) {
      console.error("❌ Error inicializando Ably REST:", err.message);
    }
  }
  return ablyRest;
}

export async function publicarEventoPedido(eventoData) {
  try {
    const client = getAblyRest();
    if (!client) return;

    const channel = client.channels.get("restaurante-pablito-pedidos");
    await channel.publish("pedido_actualizado", eventoData);
    console.log("⚡ Evento publicado con éxito en Ably Realtime:", eventoData.tipo || "actualizado", `Pedido #${eventoData.pedido_id}`);
  } catch (err) {
    console.error("❌ Error publicando evento en Ably:", err.message);
  }
}
