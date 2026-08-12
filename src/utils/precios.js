// Tasa de IVA por defecto ( configurable para Ecuador / regional - 15% )
export const TASA_IVA = parseFloat(process.env.TASA_IVA || "0.15");

/**
 * Calcula el subtotal, impuesto (IVA) y total a partir de una lista de precios y cantidades
 * @param {Array<{precio: number, cantidad: number}>} items
 * @returns {{subtotal: number, impuesto: number, total: number}}
 */
export function calcularTotales(items) {
  const totalProductosRaw = items.reduce((acc, item) => {
    return acc + item.precio * item.cantidad;
  }, 0);

  // Redondear a 2 decimales
  const totalProductos = Math.round(totalProductosRaw * 100) / 100;
  // Desglose de IVA 15% incluido (Subtotal Neto = Total / 1.15)
  const subtotal = Math.round((totalProductos / (1 + TASA_IVA)) * 100) / 100;
  const impuesto = Math.round((totalProductos - subtotal) * 100) / 100;

  return {
    subtotal,
    impuesto,
    total: totalProductos,
  };
}
