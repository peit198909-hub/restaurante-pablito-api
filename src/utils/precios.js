// Tasa de IVA por defecto ( configurable para Ecuador / regional - 15% )
export const TASA_IVA = parseFloat(process.env.TASA_IVA || "0.15");

/**
 * Calcula el subtotal, impuesto (IVA) y total a partir de una lista de precios y cantidades
 * @param {Array<{precio: number, cantidad: number}>} items
 * @returns {{subtotal: number, impuesto: number, total: number}}
 */
export function calcularTotales(items) {
  const subtotalRaw = items.reduce((acc, item) => {
    return acc + item.precio * item.cantidad;
  }, 0);

  // Redondear a 2 decimales
  const subtotal = Math.round(subtotalRaw * 100) / 100;
  const impuesto = Math.round(subtotal * TASA_IVA * 100) / 100;
  const total = Math.round((subtotal + impuesto) * 100) / 100;

  return {
    subtotal,
    impuesto,
    total,
  };
}
