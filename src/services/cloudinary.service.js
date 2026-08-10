// Servicio de Cloudinary para subida y eliminación de imágenes
// Usado para: fotos de platos del menú y comprobantes de transferencia
import { v2 as cloudinary } from "cloudinary";

// Configurar Cloudinary con variables de entorno
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Sube una imagen a Cloudinary desde una cadena base64 o una URL
 * @param {string} imagen - Imagen en formato base64 (data:image/...) o URL
 * @param {string} carpeta - Carpeta de destino en Cloudinary ('platos' o 'comprobantes')
 * @returns {Promise<{url: string, public_id: string}>} URL pública y public_id de la imagen
 */
export async function subirImagen(imagen, carpeta = "platos") {
  if (!imagen) {
    throw new Error("No se proporcionó ninguna imagen para subir");
  }

  // Validar que la configuración de Cloudinary esté completa
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary no está configurado correctamente. Verifica las variables de entorno.");
  }

  // Asegurar configuración en runtime para entornos Serverless (Vercel)
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  // Validar peso máximo del archivo: 5MB (5,242,880 bytes)
  const MAX_SIZE_BYTES = 5 * 1024 * 1024;
  if (typeof imagen === "string" && imagen.startsWith("data:image/")) {
    const base64Data = imagen.split(",")[1] || "";
    const sizeInBytes = (base64Data.length * 3) / 4;
    if (sizeInBytes > MAX_SIZE_BYTES) {
      throw new Error(`El archivo de imagen excede el peso máximo permitido de 5 MB (tamaño actual: ${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB). Por favor selecciona una imagen más liviana.`);
    }
  }

  try {
    const resultado = await cloudinary.uploader.upload(imagen, {
      folder: `restaurante-pablito/${carpeta}`,
      // Opciones de transformación automática para optimizar las imágenes
      transformation: [
        { quality: "auto", fetch_format: "auto" },
      ],
      resource_type: "image",
    });

    return {
      url: resultado.secure_url,
      public_id: resultado.public_id,
    };
  } catch (error) {
    console.error("Error al subir imagen a Cloudinary:", error.message);
    throw new Error(`Error al subir imagen: ${error.message}`);
  }
}

/**
 * Elimina una imagen de Cloudinary por su public_id
 * Útil al reemplazar la foto de un plato por otra nueva
 * @param {string} publicId - El public_id de la imagen en Cloudinary
 * @returns {Promise<boolean>} true si se eliminó correctamente
 */
export async function eliminarImagen(publicId) {
  if (!publicId) return false;

  try {
    const resultado = await cloudinary.uploader.destroy(publicId);
    return resultado.result === "ok";
  } catch (error) {
    console.error("Error al eliminar imagen de Cloudinary:", error.message);
    return false;
  }
}

/**
 * Extrae el public_id de una URL de Cloudinary
 * Ej: "https://res.cloudinary.com/xxx/image/upload/v123/restaurante-pablito/platos/abc.jpg"
 *   → "restaurante-pablito/platos/abc"
 * @param {string} url - URL completa de Cloudinary
 * @returns {string|null} public_id o null si no se pudo extraer
 */
export function extraerPublicId(url) {
  if (!url || !url.includes("cloudinary.com")) return null;

  try {
    // El public_id está después de /upload/v{version}/ y antes de la extensión
    const match = url.match(/\/upload\/(?:v\d+\/)?(.*?)(?:\.\w+)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
