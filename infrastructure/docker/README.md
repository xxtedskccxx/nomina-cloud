# Infraestructura local

La infraestructura de desarrollo está definida en el `docker-compose.yml` de
la raíz. En esta fase solo se ejecuta PostgreSQL; las aplicaciones Node se
ejecutan directamente con pnpm para facilitar el hot reload.

El puerto del host es `5433` y se mapea al `5432` interno del contenedor. Esto
permite trabajar aunque exista otra instalación PostgreSQL local usando el
puerto `5432`.

La contraseña `1234` es solo para el PostgreSQL local de desarrollo definido en
Compose. No debe reutilizarse en entornos compartidos o de producción.
