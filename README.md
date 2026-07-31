# Restaurante Pablito - API Backend

API RESTful y servicios en tiempo real para la gestión integral del **Restaurante Pablito**. Diseñada para procesar pedidos en tiempo real, catálogo de productos, seguimiento de entregas, autenticación basada en roles y configuración dinámica del negocio.

---

## 🛠️ Tecnologías Utilizadas

- **Runtime**: [Bun](https://bun.sh/) (Entorno de ejecución de alto rendimiento).
- **Framework Web**: [ElysiaJS](https://elysiajs.com/) (Framework web rápido y seguro).
- **Base de Datos**: [Turso](https://turso.tech/) / LibSQL (SQLite distribuido).
- **Autenticación**: JWT (JSON Web Tokens) con hashing de contraseñas.
- **Eventos en Tiempo Real**: Server-Sent Events (SSE) para el estado del pedido.
- **Despliegue**: Compatible con Vercel Serverless Functions y entornos Node.js / Bun.

---

## 🚀 Configuración e Instalación Local

### 1. Clonar e Instalar Dependencias

```bash
bun install
```

### 2. Configuración de Variables de Entorno

Copia el archivo de ejemplo `.env.example` para crear el archivo `.env`:

```bash
cp .env.example .env
```

Edita `.env` e ingresa las credenciales necesarias:

```env
PORT=3000
JWT_SECRET=tu_clave_secreta_jwt
JWT_EXPIRY=24h
TURSO_DATABASE_URL=libsql://tu-base-de-datos.turso.io
TURSO_AUTH_TOKEN=tu_token_de_turso
```

### 3. Migraciones de Base de Datos

Ejecuta los scripts de migración para inicializar las tablas de logs, repartidores y configuración del negocio:

```bash
bun src/db/migrate.js
bun src/db/migrate_delivery.js
bun src/db/migrate_config.js
```

### 4. Iniciar el Servidor de Desarrollo

```bash
bun run dev
```

El servidor estará activo en `http://localhost:3000`.

---

## 📋 Documentación de Endpoints de la API

---

### 👤 Módulo de Usuarios (`/api/usuarios`)

| Método | Endpoint | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/usuarios/registro` | Público | Registro de nuevos clientes. |
| `POST` | `/api/usuarios/login` | Público | Autenticación y generación de token JWT. |
| `GET` | `/api/usuarios/perfil` | Autenticado | Obtiene la información del usuario autenticado. |
| `PUT` | `/api/usuarios/perfil` | Autenticado | Actualiza perfil (nombre, teléfono, dirección, contraseña). |
| `POST` | `/api/usuarios/admin/crear` | Administrador | Registra un usuario con rol de Administrador. |

---

### 🍔 Módulo de Productos y Menú (`/api/productos`)

| Método | Endpoint | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/productos` | Público | Obtiene el catálogo del menú con paginación y filtros por categoría. |
| `GET` | `/api/productos/:id` | Público | Obtiene el detalle de un producto específico. |
| `POST` | `/api/productos` | Administrador | Registra un nuevo plato o bebida en el menú. |
| `PUT` | `/api/productos/:id` | Administrador | Actualiza la información de un producto. |
| `DELETE` | `/api/productos/:id` | Administrador | Elimina un producto del catálogo. |
| `PATCH` | `/api/productos/:id/disponibilidad` | Administrador | Cambia el estado de disponibilidad del producto (Activo/Inactivo). |

---

### 📦 Módulo de Pedidos (`/api/pedidos`)

| Método | Endpoint | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/pedidos/stream` | Autenticado | Canal SSE (Server-Sent Events) para actualizaciones de pedidos en tiempo real. |
| `POST` | `/api/pedidos` | Autenticado | Procesa un pedido validando horario de atención y cálculo de envío por km. |
| `GET` | `/api/pedidos` | Autenticado | Consulta el historial de pedidos del usuario (o todos los pedidos si es Admin). |
| `GET` | `/api/pedidos/:id` | Autenticado | Obtiene el detalle y resumen de un pedido por ID. |
| `PATCH` | `/api/pedidos/:id/estado` | Administrador | Actualiza el estado del pedido (Pendiente → Confirmado → En Preparación → Listo → En Camino → Entregado/Cancelado). |
| `GET` | `/api/pedidos/dashboard` | Administrador | Retorna métricas cuantitativas, ingresos y platos más vendidos. |

---

### 🛵 Módulo de Repartidores de Delivery (`/api/repartidores`)

| Método | Endpoint | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/repartidores` | Administrador | Lista todos los repartidores registrados. |
| `POST` | `/api/repartidores` | Administrador | Registra un repartidor con número de WhatsApp para envío de pedidos. |
| `PUT` | `/api/repartidores/:id` | Administrador | Modifica datos del repartidor (nombre, vehículo, estado). |
| `DELETE` | `/api/repartidores/:id` | Administrador | Desactiva o elimina un repartidor del sistema. |

---

### ⚙️ Módulo de Configuración del Negocio (`/api/configuracion`)

| Método | Endpoint | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/configuracion` | Público | Consulta la configuración actual del local, horario de atención, tarifas de envío por km y estado operativo (Abierto/Cerrado). |
| `PUT` | `/api/configuracion` | Administrador | Actualiza horarios, días de atención, switch manual, tarifas por km y coordenadas del local. |

---

## 🔒 Estructura del Esquema SQL

El esquema completo de la base de datos se encuentra documentado en [database/restaurante_pablito.sql](file:///c:/Users/Alexis/Desktop/pablito-remix/restaurante-pablito%20%281%29/restaurante-pablito/restaurante-pablito-api/database/restaurante_pablito.sql), e incluye:

- `usuarios`: Gestión de cuentas y roles (`cliente`, `administrador`).
- `productos`: Catálogo de platos, categorías, precios e imágenes.
- `pedidos` & `detalles_pedidos`: Transacciones, subtotales, IVA, recargo por distancia (`costo_envio`, `distancia_km`) y direcciones.
- `repartidores_delivery`: Repartidores motorizados y enlace con WhatsApp.
- `configuracion_negocio`: Parámetros operativos, horarios y tarifas por km.
- `logs`: Auditoría de actividades relevantes del sistema.

---

## ☁️ Despliegue en Vercel

El proyecto incluye un adaptador en `src/index.js` compatible con el runtime de Serverless Functions de Vercel.

Variables de entorno requeridas en la consola de Vercel:
1. `TURSO_DATABASE_URL`
2. `TURSO_AUTH_TOKEN`
3. `JWT_SECRET`
