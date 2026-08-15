# Utilizar imagen oficial ligera de Bun
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Copiar manifiesto de dependencias
COPY package.json bun.lock* ./

# Instalar dependencias para producción
RUN bun install --production

# Copiar código fuente
COPY . .

# Exponer puerto 3000 de la API
EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

# Comando de inicio del servidor
CMD ["bun", "src/index.js"]
