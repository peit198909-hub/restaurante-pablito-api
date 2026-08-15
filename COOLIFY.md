# 🐙 Guía Completa de Integración Directa con GitHub en Coolify

Esta guía explica paso a paso cómo conectar tu repositorio de **GitHub** a **Coolify** para que compile y despliegue automáticamente (**Auto-Deploy en `git push`**) tanto el **Backend API** como el **Frontend React**.

---

## 1. Conectar GitHub a Coolify

1. En el panel lateral de **Coolify**, ve a **Keys & Tokens** -> **GitHub App** (o **Sources**).
2. Haz clic en **Create GitHub App** (Coolify te guiará para instalar la aplicación de Coolify en tu cuenta u organización de GitHub).
3. Concede acceso al repositorio de tu proyecto (`restaurante-pablito`).

---

## 2. Crear los Servicios desde GitHub

### Método A: Despliegue Unificado con Docker Compose (Recomendado)

Ideal para desplegar **API + Frontend en 1 solo recurso** conectado a GitHub:

1. En Coolify, ve a tu Proyecto / Entorno y haz clic en **+ New Resource** -> **Private Repository (GitHub App)**.
2. Selecciona tu repositorio `restaurante-pablito` y la rama principal (`main` o `master`).
3. En **Build Pack**, selecciona **Docker Compose**.
4. En **Docker Compose Location**, indica: `/docker-compose.yml`.
5. En la pestaña **Environment Variables**, pega las variables globales:

```env
TURSO_DATABASE_URL=libsql://restaurante-pablito-peit.aws-us-east-1.turso.io
TURSO_AUTH_TOKEN=tu_token_turso
JWT_SECRET=supersecretjwtkeyforrestaurante_pablito_2026
JWT_EXPIRY=30d
CLOUDINARY_CLOUD_NAME=cntn9qt4
CLOUDINARY_API_KEY=943898611161114
CLOUDINARY_API_SECRET=lcy1K8zvZbA9f9zUHrVlynv2078
VITE_API_URL=https://api.tu-dominio.com
VITE_WS_URL=wss://api.tu-dominio.com/ws
```

6. Activa **Auto Deploy** (Webhooks automáticos de GitHub).
7. Haz clic en **Deploy**.

---

### Método B: Despliegue de 2 Aplicaciones Independientes desde el mismo Repositorio

Si deseas dominios separados (ej: `api.tudominio.com` y `app.tudominio.com`):

#### 🔹 1. API Backend (`restaurante-pablito-api`)
1. **+ New Resource** -> **Private Repository (GitHub App)** -> Selecciona `restaurante-pablito`.
2. Configuración:
   - **Build Pack**: `Dockerfile`
   - **Base Directory**: `/restaurante-pablito-api`
   - **Dockerfile Location**: `/Dockerfile`
   - **Port**: `3000`
3. Variables de entorno (Environment Variables):
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `JWT_SECRET`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
4. Asigna tu FQDN / Dominio (ej: `https://api.tudominio.com`).

#### 🔹 2. Frontend React (`restaurante-pablito`)
1. **+ New Resource** -> **Private Repository (GitHub App)** -> Selecciona `restaurante-pablito`.
2. Configuración:
   - **Build Pack**: `Dockerfile`
   - **Base Directory**: `/restaurante-pablito`
   - **Dockerfile Location**: `/Dockerfile`
   - **Port**: `80`
3. Variables / Build Arguments:
   - `VITE_API_URL` = `https://api.tudominio.com`
   - `VITE_WS_URL` = `wss://api.tudominio.com/ws`
4. Asigna tu FQDN / Dominio (ej: `https://tudominio.com`).

---

## ⚡ Auto-Deploy y Webhooks
Con cualquiera de los dos métodos, cada vez que hagas `git push` a tu rama en GitHub, Coolify iniciará el build automático de las imágenes Docker y actualizará tu aplicación sin interrupción.
