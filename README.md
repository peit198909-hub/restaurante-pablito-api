# API de Restaurante Pablito - Paulina Iza

Este es el backend para el proyecto del Restaurante Pablito. Sirve para controlar el registro de usuarios, el inicio de sesion y para guardar lo que hace cada usuario en la tabla de logs de Turso.

## Como hacer funcionar el proyecto en tu compu

1. Primero instala las dependencias ejecutando esto en tu terminal:
   ```bash
   bun install
   ```

2. Luego copia el archivo .env.example para crear tu .env propio:
   ```bash
   cp .env.example .env
   ```
   (Abre el archivo .env que acabas de crear y pon tu base de datos de Turso, tu token y tu clave secreta de JWT).

3. Corre la migracion para crear la tabla de logs en Turso:
   ```bash
   bun src/db/migrate.js
   ```

4. Levanta el servidor con:
   ```bash
   bun run dev
   ```
   El servidor se va a quedar corriendo en: http://localhost:3000.

---

## Las rutas que tiene la API

Todas las rutas empiezan con el prefijo `/api/usuarios`.

### POST /registro
Es publica. Sirve para registrar clientes nuevos en el sistema.
Tienes que mandarle en el body:
- nombre
- apellido
- correo
- contrasena
- telefono (si quieres, es opcional)
- direccion (si quieres, es opcional)

### POST /login
Es publica. Sirve para iniciar sesion metiendo tu correo y contrasena. Si todo esta bien, te devuelve el token JWT para que puedas entrar a las demas secciones.

### GET /perfil
Es protegida. Tienes que mandar el token en la cabecera (Header) de la peticion con `Authorization: Bearer <TOKEN>`. Te devuelve los datos del usuario logueado.

### PUT /perfil
Es protegida. Sirve para que el usuario cambie su nombre, apellido, telefono y direccion. Tambien puedes cambiar la clave aqui si mandas en el body `contrasenaActual` y `contrasenaNueva`.

### POST /admin/crear
Es protegida y solo sirve para usuarios administradores. La usas para registrar un nuevo usuario con rol de administrador de forma segura.
