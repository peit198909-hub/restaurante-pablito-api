import { Elysia, t } from "elysia";
import * as service from "../services/productos.service.js";

export const productosRoutes = new Elysia({ prefix: "/api" })
  // 1. Obtener categorias activas (publico)
  .get("/categorias", async () => {
    const categorias = await service.obtenerCategoriasActivas();
    return { status: "success", categorias };
  })

  // 2. Obtener lista de productos activos (publico)
  .get("/productos", async ({ query }) => {
    const categoria = query.categoria || null;
    const busqueda = query.q || null;
    const productos = await service.obtenerProductosActivos(categoria, busqueda);
    return { status: "success", productos };
  })

  // 3. Obtener detalle de un producto disponible (publico)
  .get("/productos/:id", async ({ params, set }) => {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 400;
      return { status: "error", message: "ID de producto invalido" };
    }

    const producto = await service.obtenerProductoPorId(id, true);
    if (!producto) {
      set.status = 404;
      return { status: "error", message: "Producto no encontrado o no disponible" };
    }

    return { status: "success", producto };
  })

  // Sub-grupo de rutas administrativas (requiere Token + rol administrador)
  .guard({
    beforeHandle: async ({ jwt, headers, set }) => {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { status: "error", message: "No autorizado: Token no proporcionado" };
      }

      const token = authHeader.split(" ")[1];
      const payload = await jwt.verify(token);
      if (!payload) {
        set.status = 401;
        return { status: "error", message: "No autorizado: Token invalido o expirado" };
      }

      if (payload.rol !== "administrador") {
        set.status = 403;
        return { status: "error", message: "Forbidden: Se requieren permisos de administrador" };
      }
    }
  }, (app) => app
    // 4. Obtener todos los productos para administrador (con paginacion)
    .get("/productos/admin", async ({ query }) => {
      const res = await service.obtenerTodosProductosAdmin(query.page, query.limit);
      return { status: "success", ...res };
    })

    // 5. Crear producto
    .post("/productos", async ({ body, set }) => {
      if (body.precio <= 0) {
        set.status = 422;
        return { status: "error", message: "El precio del producto debe ser mayor a 0" };
      }

      const nuevoProducto = await service.crearProducto(body);
      set.status = 201;
      return {
        status: "success",
        message: "Producto creado con exito",
        producto: nuevoProducto,
      };
    }, {
      body: t.Object({
        nombre: t.String({ minLength: 2 }),
        descripcion: t.Optional(t.String()),
        precio: t.Number(),
        categoria: t.String({ minLength: 2 }),
        imagen_url: t.Optional(t.String()),
        disponible: t.Optional(t.Boolean()),
      })
    })

    // 6. Editar producto completo
    .put("/productos/:id", async ({ params, body, set }) => {
      const id = parseInt(params.id, 10);
      if (isNaN(id)) {
        set.status = 400;
        return { status: "error", message: "ID de producto invalido" };
      }

      if (body.precio <= 0) {
        set.status = 422;
        return { status: "error", message: "El precio del producto debe ser mayor a 0" };
      }

      const productoEditado = await service.editarProducto(id, body);
      if (!productoEditado) {
        set.status = 404;
        return { status: "error", message: "Producto no encontrado" };
      }

      return {
        status: "success",
        message: "Producto actualizado con exito",
        producto: productoEditado,
      };
    }, {
      body: t.Object({
        nombre: t.String({ minLength: 2 }),
        descripcion: t.Optional(t.String()),
        precio: t.Number(),
        categoria: t.String({ minLength: 2 }),
        imagen_url: t.Optional(t.String()),
        disponible: t.Optional(t.Boolean()),
      })
    })

    // 7. Alternar disponibilidad de un producto (borrado logico HU-07)
    .patch("/productos/:id/disponibilidad", async ({ params, body, set }) => {
      const id = parseInt(params.id, 10);
      if (isNaN(id)) {
        set.status = 400;
        return { status: "error", message: "ID de producto invalido" };
      }

      const productoActualizado = await service.cambiarDisponibilidadProducto(id, body.disponible);
      if (!productoActualizado) {
        set.status = 404;
        return { status: "error", message: "Producto no encontrado" };
      }

      return {
        status: "success",
        message: `Disponibilidad de producto cambiada a: ${productoActualizado.disponible ? "Disponible" : "No disponible"}`,
        producto: productoActualizado,
      };
    }, {
      body: t.Object({
        disponible: t.Boolean(),
      })
    })
  );
