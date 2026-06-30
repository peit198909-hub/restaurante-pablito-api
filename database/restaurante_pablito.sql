
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