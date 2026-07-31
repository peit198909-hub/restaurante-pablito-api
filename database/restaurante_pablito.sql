
-- Tabla de usuarios

CREATE TABLE IF NOT EXISTS usuarios (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Datos personales (HU-01)
    nombre          TEXT    NOT NULL,
    apellido        TEXT    NOT NULL,

    -- Credenciales de acceso (HU-01, HU-02)
    correo          TEXT    NOT NULL UNIQUE,
    contrasena_hash TEXT    NOT NULL,

    -- Contacto y entrega (HU-04, HU-09)
    telefono        TEXT,
    direccion       TEXT,

    -- Rol del usuario dentro del sistema (HU-06)
    -- 'cliente'       -> usuario que realiza pedidos
    -- 'administrador' -> personal del restaurante que gestiona pedidos/menú/entregas
    rol             TEXT    NOT NULL DEFAULT 'cliente'
                    CHECK (rol IN ('cliente', 'administrador')),

    -- Estado de la cuenta (permite desactivar sin borrar el registro)
    activo          INTEGER NOT NULL DEFAULT 1
                    CHECK (activo IN (0, 1)),

    -- Auditoría
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now')),
    actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Índice para acelerar búsquedas/login por correo (además del UNIQUE ya implícito)
CREATE INDEX IF NOT EXISTS idx_usuarios_correo ON usuarios (correo);

-- Índice para filtrar rápidamente por rol (ej: listar todos los administradores)
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios (rol);

-- ============================================================
-- Trigger para mantener actualizado_en al día en cada UPDATE
-- ============================================================
CREATE TRIGGER IF NOT EXISTS trg_usuarios_actualizado_en
AFTER UPDATE ON usuarios
FOR EACH ROW
BEGIN
    UPDATE usuarios
    SET actualizado_en = datetime('now')
    WHERE id = OLD.id;
END;


-- ============================================================
-- 2. TABLA: PRODUCTOS (Catálogo del menú - HU-03, HU-07)
-- ============================================================
CREATE TABLE IF NOT EXISTS productos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
 
    -- Información del producto
    nombre          TEXT    NOT NULL,
    descripcion     TEXT,
    precio          REAL    NOT NULL CHECK (precio > 0),
 
    -- Categoría para organizar el menú
    -- Ej: 'Platos Principales', 'Bebidas', 'Postres', 'Entradas', etc.
    categoria       TEXT    NOT NULL,
 
    -- Control de inventario y disponibilidad
    disponible      INTEGER NOT NULL DEFAULT 1
                    CHECK (disponible IN (0, 1)),
 
    -- URL o ruta de la imagen del producto (opcional)
    imagen_url      TEXT,
 
    -- Información de auditoría
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now')),
    actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- Índices para tabla productos
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos (categoria);
CREATE INDEX IF NOT EXISTS idx_productos_disponible ON productos (disponible);
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos (nombre);
 
-- Trigger para actualizar timestamp en tabla productos
CREATE TRIGGER IF NOT EXISTS trg_productos_actualizado_en
AFTER UPDATE ON productos
FOR EACH ROW
BEGIN
    UPDATE productos
    SET actualizado_en = datetime('now')
    WHERE id = OLD.id;
END;
 
-- ============================================================
-- 3. TABLA: PEDIDOS (Encabezado del pedido - HU-04, HU-05, HU-06)
-- ============================================================
CREATE TABLE IF NOT EXISTS pedidos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
 
    -- Relación con el cliente que hace el pedido
    usuario_id      INTEGER NOT NULL,
 
    -- Información de dirección de entrega (por si cambia desde el perfil)
    direccion_entrega    TEXT NOT NULL,
    ciudad_entrega       TEXT,
    codigo_postal_entrega TEXT,
 
    -- Información de contacto para el reparto
    telefono_contacto    TEXT,
 
    -- Notas especiales del cliente para la preparación/entrega
    notas               TEXT,
 
    -- Estado del pedido
    -- 'pendiente'      -> Recibido pero no confirmado
    -- 'confirmado'     -> Aceptado por el restaurante
    -- 'en_preparacion' -> Se está cocinando
    -- 'listo'          -> Listo para entregar
    -- 'en_camino'      -> Salió para entregar
    -- 'entregado'      -> Entregado al cliente
    -- 'cancelado'      -> Cancelado por cliente o restaurante
    estado          TEXT    NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'confirmado', 'en_preparacion', 
                                     'listo', 'en_camino', 'entregado', 'cancelado')),
 
    -- Totales del pedido
    subtotal        REAL    NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    impuesto        REAL    NOT NULL DEFAULT 0 CHECK (impuesto >= 0),
    costo_envio     REAL    NOT NULL DEFAULT 0 CHECK (costo_envio >= 0),
    distancia_km    REAL    NOT NULL DEFAULT 0 CHECK (distancia_km >= 0),
    total           REAL    NOT NULL CHECK (total >= 0),
 
    -- Método de pago
    -- 'efectivo'         -> Pago contra entrega
    -- 'transferencia'    -> Transferencia bancaria
    -- 'otro'            -> Otro método definido localmente
    metodo_pago     TEXT    NOT NULL DEFAULT 'efectivo'
                    CHECK (metodo_pago IN ('efectivo', 'transferencia', 'otro')),
 
    -- Timestamp de creación y actualización
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now')),
    actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now')),
 
    -- Restricción de clave foránea
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
 
-- Índices para tabla pedidos
CREATE INDEX IF NOT EXISTS idx_pedidos_usuario_id ON pedidos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos (estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_creado_en ON pedidos (creado_en);
 
-- Trigger para actualizar timestamp en tabla pedidos
CREATE TRIGGER IF NOT EXISTS trg_pedidos_actualizado_en
AFTER UPDATE ON pedidos
FOR EACH ROW
BEGIN
    UPDATE pedidos
    SET actualizado_en = datetime('now')
    WHERE id = OLD.id;
END;
 
-- ============================================================
-- 4. TABLA: DETALLES_PEDIDOS (Línea de items del pedido - HU-04)
-- ============================================================
CREATE TABLE IF NOT EXISTS detalles_pedidos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
 
    -- Relación con el pedido
    pedido_id       INTEGER NOT NULL,
 
    -- Relación con el producto pedido
    producto_id     INTEGER NOT NULL,
 
    -- Cantidad solicitada del producto
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
 
    -- Precio unitario al momento del pedido (se guarda para histórico)
    precio_unitario REAL    NOT NULL CHECK (precio_unitario > 0),
 
    -- Subtotal de esta línea (cantidad * precio_unitario)
    subtotal        REAL    NOT NULL CHECK (subtotal > 0),
 
    -- Notas especiales del cliente para este producto
    -- Ej: "Sin picante", "Doble queso", etc.
    notas           TEXT,
 
    -- Timestamp
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now')),
 
    -- Restricciones de clave foránea
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
 
-- Índices para tabla detalles_pedidos
CREATE INDEX IF NOT EXISTS idx_detalles_pedidos_pedido_id ON detalles_pedidos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_detalles_pedidos_producto_id ON detalles_pedidos (producto_id);
 
-- ============================================================
-- 5. TABLA: ENTREGAS (Seguimiento de entregas - HU-08)
-- ============================================================
CREATE TABLE IF NOT EXISTS entregas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
 
    -- Relación con el pedido a entregar
    pedido_id       INTEGER NOT NULL UNIQUE,
 
    -- Persona asignada para hacer la entrega (usuario administrador)
    repartidor_id   INTEGER,
 
    -- Estado de la entrega
    -- 'no_iniciada'    -> Pedido no está listo para entregar
    -- 'asignada'       -> Se asignó a un repartidor
    -- 'en_camino'      -> El repartidor salió del restaurante
    -- 'entregada'      -> Entregada correctamente al cliente
    -- 'devuelta'       -> No se pudo entregar (cliente no disponible, etc.)
    estado          TEXT    NOT NULL DEFAULT 'no_iniciada'
                    CHECK (estado IN ('no_iniciada', 'asignada', 'en_camino', 
                                     'entregada', 'devuelta')),
 
    -- Fecha y hora de asignación
    fecha_asignacion     TEXT,
 
    -- Fecha y hora de salida del restaurante
    fecha_salida         TEXT,
 
    -- Fecha y hora de entrega/intento de entrega
    fecha_entrega        TEXT,
 
    -- Notas del repartidor sobre la entrega
    notas               TEXT,
 
    -- Timestamp de registro
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now')),
    actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now')),
 
    -- Restricciones de clave foránea
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (repartidor_id) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
);
 
-- Índices para tabla entregas
CREATE INDEX IF NOT EXISTS idx_entregas_pedido_id ON entregas (pedido_id);
CREATE INDEX IF NOT EXISTS idx_entregas_repartidor_id ON entregas (repartidor_id);
CREATE INDEX IF NOT EXISTS idx_entregas_estado ON entregas (estado);
CREATE INDEX IF NOT EXISTS idx_entregas_creado_en ON entregas (creado_en);
 
-- Trigger para actualizar timestamp en tabla entregas
CREATE TRIGGER IF NOT EXISTS trg_entregas_actualizado_en
AFTER UPDATE ON entregas
FOR EACH ROW
BEGIN
    UPDATE entregas
    SET actualizado_en = datetime('now')
    WHERE id = OLD.id;
END;
 
-- ============================================================
-- 6. TABLA: HISTORIAL_ESTADO_PEDIDOS (Auditoría de cambios de estado)
-- ============================================================
-- Esta tabla registra todos los cambios de estado de un pedido para tener
-- un historial completo de lo que sucedió con cada pedido
-- ============================================================
CREATE TABLE IF NOT EXISTS historial_estado_pedidos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
 
    -- Relación con el pedido
    pedido_id       INTEGER NOT NULL,
 
    -- Estado anterior y nuevo
    estado_anterior TEXT,
    estado_nuevo    TEXT    NOT NULL,
 
    -- Usuario que realizó el cambio (administrador)
    usuario_id      INTEGER,
 
    -- Motivo o nota del cambio (ej: "Cancelado por solicitud del cliente")
    motivo          TEXT,
 
    -- Timestamp del cambio
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now')),
 
    -- Restricciones de clave foránea
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
);
 
-- Índices para tabla historial_estado_pedidos
CREATE INDEX IF NOT EXISTS idx_historial_pedido_id ON historial_estado_pedidos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_historial_creado_en ON historial_estado_pedidos (creado_en);
 
-- ============================================================
-- 7. TABLA: CATEGORIAS_PRODUCTOS (Maestro de categorías)
-- ============================================================
-- Tabla opcional para estandarizar las categorías disponibles
-- ============================================================
CREATE TABLE IF NOT EXISTS categorias_productos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
 
    -- Nombre de la categoría
    nombre          TEXT    NOT NULL UNIQUE,
 
    -- Descripción de la categoría
    descripcion     TEXT,
 
    -- Orden de visualización en el menú
    orden           INTEGER,
 
    -- Estado de la categoría (activa/inactiva)
    activa          INTEGER NOT NULL DEFAULT 1
                    CHECK (activa IN (0, 1)),
 
    -- Timestamp
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now')),
    actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- Índice para tabla categorias_productos
CREATE INDEX IF NOT EXISTS idx_categorias_activa ON categorias_productos (activa);
 
-- Trigger para actualizar timestamp en tabla categorias_productos
CREATE TRIGGER IF NOT EXISTS trg_categorias_actualizado_en
AFTER UPDATE ON categorias_productos
FOR EACH ROW
BEGIN
    UPDATE categorias_productos
    SET actualizado_en = datetime('now')
    WHERE id = OLD.id;
END;
 
-- ============================================================
-- 8. TABLA: HISTORIAL_ENTREGAS (Auditoría de cambios de estado de entregas)
-- ============================================================
CREATE TABLE IF NOT EXISTS historial_entregas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
 
    -- Relación con la entrega
    entrega_id      INTEGER NOT NULL,
 
    -- Estado anterior y nuevo
    estado_anterior TEXT,
    estado_nuevo    TEXT    NOT NULL,
 
    -- Usuario que realizó el cambio
    usuario_id      INTEGER,
 
    -- Observación del cambio
    observacion     TEXT,
 
    -- Timestamp del cambio
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now')),
 
    -- Restricciones de clave foránea
    FOREIGN KEY (entrega_id) REFERENCES entregas(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
);
 
-- Índices para tabla historial_entregas
CREATE INDEX IF NOT EXISTS idx_historial_entrega_id ON historial_entregas (entrega_id);
CREATE INDEX IF NOT EXISTS idx_historial_entrega_creado_en ON historial_entregas (creado_en);
 
-- ============================================================
-- 9. TABLA: REPORTES_DIARIOS (Resumen diario de operaciones)
-- ============================================================
-- Tabla opcional para almacenar resúmenes diarios (útil para reportes)
-- ============================================================
CREATE TABLE IF NOT EXISTS reportes_diarios (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
 
    -- Fecha del reporte
    fecha           TEXT    NOT NULL UNIQUE,
 
    -- Estadísticas del día
    total_pedidos   INTEGER NOT NULL DEFAULT 0,
    pedidos_entregados INTEGER NOT NULL DEFAULT 0,
    pedidos_cancelados INTEGER NOT NULL DEFAULT 0,
    ingresos_total  REAL    NOT NULL DEFAULT 0,
 
    -- Timestamp de generación
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now')),
    actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- Índice para tabla reportes_diarios
CREATE INDEX IF NOT EXISTS idx_reportes_fecha ON reportes_diarios (fecha);
 
-- Trigger para actualizar timestamp en tabla reportes_diarios
CREATE TRIGGER IF NOT EXISTS trg_reportes_actualizado_en
AFTER UPDATE ON reportes_diarios
FOR EACH ROW
BEGIN
    UPDATE reportes_diarios
    SET actualizado_en = datetime('now')
    WHERE id = OLD.id;
END;
 
-- ============================================================
-- TRIGGERS ADICIONALES PARA LÓGICA DE NEGOCIO
-- ============================================================
 
-- Trigger: Registrar cambio de estado en historial cuando se actualiza un pedido
CREATE TRIGGER IF NOT EXISTS trg_registrar_cambio_estado_pedido
AFTER UPDATE OF estado ON pedidos
FOR EACH ROW
WHEN OLD.estado <> NEW.estado
BEGIN
    INSERT INTO historial_estado_pedidos 
        (pedido_id, estado_anterior, estado_nuevo, creado_en)
    VALUES (NEW.id, OLD.estado, NEW.estado, datetime('now'));
END;
 
-- Trigger: Registrar cambio de estado en historial cuando se actualiza una entrega
CREATE TRIGGER IF NOT EXISTS trg_registrar_cambio_estado_entrega
AFTER UPDATE OF estado ON entregas
FOR EACH ROW
WHEN OLD.estado <> NEW.estado
BEGIN
    INSERT INTO historial_entregas 
        (entrega_id, estado_anterior, estado_nuevo, creado_en)
    VALUES (NEW.id, OLD.estado, NEW.estado, datetime('now'));
END;
 
-- Trigger: Crear registro de entrega cuando se crea un pedido
CREATE TRIGGER IF NOT EXISTS trg_crear_entrega_nuevo_pedido
AFTER INSERT ON pedidos
FOR EACH ROW
BEGIN
    INSERT INTO entregas (pedido_id, estado, creado_en)
    VALUES (NEW.id, 'no_iniciada', datetime('now'));
END;
 
-- ============================================================
-- VISTAS ÚTILES PARA CONSULTAS FRECUENTES
-- ============================================================
 
-- Vista: Pedidos con información completa del cliente
CREATE VIEW IF NOT EXISTS v_pedidos_con_cliente AS
SELECT 
    p.id as pedido_id,
    p.estado,
    p.total,
    p.creado_en,
    u.nombre,
    u.apellido,
    u.correo,
    u.telefono,
    p.direccion_entrega
FROM pedidos p
LEFT JOIN usuarios u ON p.usuario_id = u.id
ORDER BY p.creado_en DESC;
 
-- Vista: Detalle completo de pedidos
CREATE VIEW IF NOT EXISTS v_pedidos_detallado AS
SELECT 
    p.id as pedido_id,
    p.estado,
    p.total,
    p.creado_en,
    p.usuario_id,
    u.nombre,
    u.apellido,
    COUNT(dp.id) as cantidad_items,
    GROUP_CONCAT(pr.nombre || ' (x' || dp.cantidad || ')', ', ') as productos
FROM pedidos p
LEFT JOIN usuarios u ON p.usuario_id = u.id
LEFT JOIN detalles_pedidos dp ON p.id = dp.pedido_id
LEFT JOIN productos pr ON dp.producto_id = pr.id
GROUP BY p.id;
 
-- Vista: Entregas pendientes
CREATE VIEW IF NOT EXISTS v_entregas_pendientes AS
SELECT 
    e.id as entrega_id,
    e.pedido_id,
    e.estado,
    p.total,
    p.direccion_entrega,
    p.telefono_contacto,
    u.nombre as cliente_nombre,
    u.apellido as cliente_apellido
FROM entregas e
LEFT JOIN pedidos p ON e.pedido_id = p.id
LEFT JOIN usuarios u ON p.usuario_id = u.id
WHERE e.estado IN ('no_iniciada', 'asignada', 'en_camino')
ORDER BY e.creado_en ASC;
 
-- Vista: Resumen de ventas por día
CREATE VIEW IF NOT EXISTS v_resumen_ventas_diarias AS
SELECT 
    DATE(p.creado_en) as fecha,
    COUNT(CASE WHEN p.estado = 'entregado' THEN 1 END) as pedidos_entregados,
    COUNT(CASE WHEN p.estado = 'cancelado' THEN 1 END) as pedidos_cancelados,
    COUNT(*) as total_pedidos,
    SUM(CASE WHEN p.estado = 'entregado' THEN p.total ELSE 0 END) as ingresos_total
FROM pedidos p
GROUP BY DATE(p.creado_en)
ORDER BY fecha DESC;
 
-- ============================================================
-- 10. TABLA: REPARTIDORES_DELIVERY (Gestión de Repartidores y Envío por WhatsApp)
-- ============================================================
-- Esta tabla permite registrar y gestionar los repartidores o motorizados
-- para asignarles pedidos desde el panel de control y generar el enlace
-- directo de notificación de pedido por WhatsApp (WhatsApp Web / API).
-- ============================================================
CREATE TABLE IF NOT EXISTS repartidores_delivery (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Nombre y Apellido del repartidor / motorizado
    nombre          TEXT    NOT NULL,
    apellido        TEXT    NOT NULL,

    -- Número de teléfono en formato internacional (ej: '593991234567')
    -- utilizado para enviar el mensaje con los detalles del pedido por WhatsApp
    telefono_whatsapp TEXT  NOT NULL UNIQUE,

    -- Vehículo del repartidor: 'moto', 'bicicleta', 'auto', 'a_pie'
    tipo_vehiculo   TEXT    NOT NULL DEFAULT 'moto'
                    CHECK (tipo_vehiculo IN ('moto', 'bicicleta', 'auto', 'a_pie')),

    -- Placa o identificación del vehículo (opcional)
    placa_vehiculo  TEXT,

    -- Estado de disponibilidad del repartidor (1 = Disponible / Activo, 0 = Inactivo)
    activo          INTEGER NOT NULL DEFAULT 1
                    CHECK (activo IN (0, 1)),

    -- Timestamp de creación y actualización
    creado_en       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    actualizado_en  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Índices para repartidores_delivery
CREATE INDEX IF NOT EXISTS idx_repartidores_whatsapp ON repartidores_delivery (telefono_whatsapp);
CREATE INDEX IF NOT EXISTS idx_repartidores_activo ON repartidores_delivery (activo);

-- Trigger para actualizar timestamp en repartidores_delivery
CREATE TRIGGER IF NOT EXISTS trg_repartidores_delivery_actualizado_en
AFTER UPDATE ON repartidores_delivery
FOR EACH ROW
BEGIN
    UPDATE repartidores_delivery
    SET actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = OLD.id;
END;

-- Datos de ejemplo iniciales (Semilla de repartidores de delivery)
INSERT INTO repartidores_delivery (nombre, apellido, telefono_whatsapp, tipo_vehiculo, placa_vehiculo, activo)
VALUES 
    ('Juan', 'Pérez', '593991234567', 'moto', 'PBX-1234', 1),
    ('Carlos', 'López', '593987654321', 'moto', 'PCY-9876', 1)
ON CONFLICT(telefono_whatsapp) DO NOTHING;

-- ============================================================
-- FIN DEL ESQUEMA
-- ============================================================


-- ============================================================
-- 10. TABLA: REPARTIDORES_DELIVERY (Gestión de Repartidores y Envío por WhatsApp)
-- ============================================================
CREATE TABLE IF NOT EXISTS repartidores_delivery (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Nombre y Apellido del repartidor / motorizado
    nombre          TEXT    NOT NULL,
    apellido        TEXT    NOT NULL,

    -- Número de teléfono en formato internacional (ej: '593991234567')
    -- utilizado para enviar el mensaje con los detalles del pedido por WhatsApp
    telefono_whatsapp TEXT  NOT NULL UNIQUE,

    -- Vehículo del repartidor: 'moto', 'bicicleta', 'auto', 'a_pie'
    tipo_vehiculo   TEXT    NOT NULL DEFAULT 'moto'
                    CHECK (tipo_vehiculo IN ('moto', 'bicicleta', 'auto', 'a_pie')),

    -- Placa o identificación del vehículo (opcional)
    placa_vehiculo  TEXT,

    -- Estado de disponibilidad del repartidor (1 = Disponible / Activo, 0 = Inactivo)
    activo          INTEGER NOT NULL DEFAULT 1
                    CHECK (activo IN (0, 1)),

    -- Timestamp de creación y actualización
    creado_en       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    actualizado_en  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_repartidores_whatsapp ON repartidores_delivery (telefono_whatsapp);
CREATE INDEX IF NOT EXISTS idx_repartidores_activo ON repartidores_delivery (activo);

-- Trigger para actualizar timestamp
CREATE TRIGGER IF NOT EXISTS trg_repartidores_delivery_actualizado_en
AFTER UPDATE ON repartidores_delivery
FOR EACH ROW
BEGIN
    UPDATE repartidores_delivery
    SET actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = OLD.id;
END;

-- Datos de ejemplo iniciales (Semilla de repartidores de delivery)
INSERT INTO repartidores_delivery (nombre, apellido, telefono_whatsapp, tipo_vehiculo, placa_vehiculo, activo)
VALUES 
    ('Juan', 'Pérez', '593991234567', 'moto', 'PBX-1234', 1),
    ('Carlos', 'López', '593987654321', 'moto', 'PCY-9876', 1)
ON CONFLICT(telefono_whatsapp) DO NOTHING;

-- ============================================================
-- 11. TABLA: CONFIGURACION_NEGOCIO (Configuración del Local, Horarios y Delivery)
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracion_negocio (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Información del local
    nombre_negocio          TEXT    NOT NULL DEFAULT 'Restaurante Pablito',
    telefono_contacto       TEXT    DEFAULT '0991234567',
    direccion_local         TEXT    DEFAULT 'Av. Principal #123, Quito, Ecuador',

    -- Horarios de atención
    hora_apertura           TEXT    NOT NULL DEFAULT '08:00',
    hora_cierre             TEXT    NOT NULL DEFAULT '22:00',
    dias_atencion           TEXT    NOT NULL DEFAULT 'Lunes a Domingo',

    -- Estado manual del local (1 = Abierto / Automático por horario, 0 = Cerrado Forzado)
    abierto_manual          INTEGER NOT NULL DEFAULT 1 CHECK (abierto_manual IN (0, 1)),

    -- Configuración de envío por delivery
    costo_base_envio        REAL    NOT NULL DEFAULT 1.50 CHECK (costo_base_envio >= 0),
    precio_por_km           REAL    NOT NULL DEFAULT 0.50 CHECK (precio_por_km >= 0),
    distancia_maxima_km     REAL    NOT NULL DEFAULT 15.0 CHECK (distancia_maxima_km > 0),

    -- Coordenadas geográficas del local para cálculo de distancia
    latitud_restaurante     REAL    NOT NULL DEFAULT -0.180653,
    longitud_restaurante    REAL    NOT NULL DEFAULT -78.467838,

    -- Timestamps de auditoría
    creado_en               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    actualizado_en          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Trigger para actualizar timestamp en configuracion_negocio
CREATE TRIGGER IF NOT EXISTS trg_configuracion_negocio_actualizado_en
AFTER UPDATE ON configuracion_negocio
FOR EACH ROW
BEGIN
    UPDATE configuracion_negocio
    SET actualizado_en = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = OLD.id;
END;

-- Datos de ejemplo iniciales (Configuración única del local)
INSERT INTO configuracion_negocio (
    id, nombre_negocio, hora_apertura, hora_cierre, dias_atencion,
    abierto_manual, costo_base_envio, precio_por_km, distancia_maxima_km,
    latitud_restaurante, longitud_restaurante
)
VALUES (
    1, 'Restaurante Pablito', '08:00', '22:00', 'Lunes a Domingo',
    1, 1.50, 0.50, 15.0,
    -0.180653, -78.467838
)
ON CONFLICT(id) DO NOTHING;

-- ============================================================
-- FIN DEL ESQUEMA
-- ============================================================

