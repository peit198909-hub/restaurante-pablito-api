# Restaurante Pablito - API de Usuarios

Backend para la gestion de usuarios, autenticacion y logs del Restaurante Pablito. Implementado con Bun, Elysia, y base de datos Turso (LibSQL).

## Requisitos Previos

- Tener instalado [Bun](https://bun.sh/) (version 1.0 o superior).

## Instalacion y Ejecucion

1. Instalar las dependencias de la API:
   ```bash
   bun install
   ```

2. Crear y configurar el archivo `.env` basado en `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Ejecutar las migraciones para crear las tablas necesarias en Turso:
   ```bash
   bun src/db/migrate.js
   ```

4. Correr el servidor en modo desarrollo (con recarga automatica/hot-reload):
   ```bash
   bun run dev
   ```
   El servidor estara disponible en: `http://localhost:3000`.

## Variables de Entorno (.env)

| Variable | Descripcion | Ejemplo |
| :--- | :--- | :--- |
| `PORT` | Puerto de escucha del servidor | `3000` |
| `TURSO_DATABASE_URL` | URL de conexion de la base de datos Turso | `libsql://restaurante-pablito.turso.io` |
| `TURSO_AUTH_TOKEN` | Token de autorizacion de base de datos Turso | `eyJhbGci...` |
| `JWT_SECRET` | Clave secreta para firmar y verificar tokens JWT | `tu_clave_secreta_aqui` |
| `JWT_EXPIRY` | Tiempo de expiracion del token JWT | `24h` |

## Rutas de la API (Prefijo: `/api/usuarios`)

### 1. Registro de Cliente
- **Ruta**: `POST /registro`
- **Acceso**: Publico
- **Accion**: Registra un nuevo usuario con rol de `cliente` y lo loguea automaticamente devolviendo un token.
- **Cuerpo de la Peticion (JSON)**:
  ```json
  {
    "nombre": "Juan",
    "apellido": "Perez",
    "correo": "juan.perez@ejemplo.com",
    "contrasena": "claveSegura123",
    "telefono": "987654321", // Opcional
    "direccion": "Av. Del Sol 123" // Opcional
  }
  ```

### 2. Inicio de Sesion
- **Ruta**: `POST /login`
- **Acceso**: Publico
- **Accion**: Valida las credenciales y devuelve el token JWT con los datos basicos del usuario.
- **Cuerpo de la Peticion (JSON)**:
  ```json
  {
    "correo": "juan.perez@ejemplo.com",
    "contrasena": "claveSegura123"
  }
  ```

### 3. Obtener Perfil de Usuario
- **Ruta**: `GET /perfil`
- **Acceso**: Protegido (requiere cabecera `Authorization: Bearer <TOKEN>`)
- **Accion**: Devuelve los datos del perfil del usuario autenticado actual.

### 4. Modificar Perfil de Usuario
- **Ruta**: `PUT /perfil`
- **Acceso**: Protegido (requiere cabecera `Authorization: Bearer <TOKEN>`)
- **Accion**: Modifica la informacion del perfil del usuario y opcionalmente cambia su contraseña.
- **Cuerpo de la Peticion (JSON)**:
  ```json
  {
    "nombre": "Juan Carlos",
    "apellido": "Perez Gomez",
    "telefono": "999888777", // Opcional
    "direccion": "Nueva Direccion 456", // Opcional
    "contrasenaActual": "claveSegura123", // Opcional (obligatorio si envias contrasenaNueva)
    "contrasenaNueva": "nuevaClave456" // Opcional
  }
  ```

### 5. Crear Administrador (Exclusivo)
- **Ruta**: `POST /admin/crear`
- **Acceso**: Protegido (requiere cabecera `Authorization: Bearer <TOKEN>` de un usuario con rol = `administrador`)
- **Accion**: Permite a un administrador crear nuevas cuentas de administradores en el sistema.
- **Cuerpo de la Peticion (JSON)**:
  ```json
  {
    "nombre": "Ana",
    "apellido": "Admin",
    "correo": "ana.admin@ejemplo.com",
    "contrasena": "adminClave99",
    "telefono": "955555555", // Opcional
    "direccion": "Oficinas Centrales" // Opcional
  }
  ```
