# Despliegue de producción

Este documento prepara un despliegue, pero no ejecuta cambios en proveedores,
clusters, buckets ni bases de datos de producción.

## 1. Provisionar PostgreSQL

Usa PostgreSQL administrado con TLS, backups automáticos, retención definida y
un usuario de aplicación con los permisos necesarios para el schema. Registra
la URL en el gestor de secretos del proveedor, no en Git:

```env
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>?schema=public&sslmode=require
```

El proveedor debe permitir conexiones desde el job de migración y desde la
API. No uses `prisma migrate reset` ni `db:push` en producción.

## 2. Provisionar el bucket privado

Crea un bucket privado S3-compatible con bloqueo de acceso público y una
credencial de mínimo privilegio para `PutObject`, `GetObject`, `HeadObject` y
`DeleteObject` sobre el prefijo de payslips. Activa versioning/retención según
la política de la organización y aplica lifecycle solo después de revisar las
necesidades legales de conservación.

Variables mínimas:

```env
PAYSLIP_STORAGE_DRIVER=s3
S3_ENDPOINT=https://<s3-or-r2-endpoint>
S3_REGION=<region>
S3_BUCKET=<private-bucket>
S3_ACCESS_KEY_ID=<runtime-access-key>
S3_SECRET_ACCESS_KEY=<runtime-secret>
S3_FORCE_PATH_STYLE=false
```

Para R2, usa el endpoint S3 de la cuenta y la región que indique el proveedor.
Cambia `S3_FORCE_PATH_STYLE` solo si el proveedor lo requiere. Nunca
establezcas ACL `public-read` ni publiques el bucket.

## 3. Configurar el entorno

Además de PostgreSQL y storage:

```env
NODE_ENV=production
API_PORT=4000
BETTER_AUTH_SECRET=<random-secret-at-least-32-characters>
BETTER_AUTH_URL=https://api.example.com
WEB_URL=https://payroll.example.com
NEXT_PUBLIC_API_URL=https://api.example.com/api
SWAGGER_ENABLED=false
TRUST_PROXY_HOPS=1
```

`BETTER_AUTH_URL` es la URL pública de la API y `WEB_URL` el único origen del
portal. La validación de configuración rechaza storage drivers desconocidos,
S3 incompleto y URLs públicas HTTP en producción. No configures `SEED_*` en el
entorno de producción.

## 4. Proxy y cookies

Termina TLS en el reverse proxy del proveedor y mantén el origin de API
protegido. Configura `TRUST_PROXY_HOPS` con el número exacto de proxies
conocidos entre el cliente y NestJS; déjalo en `0` si la API es accesible
directamente. Esto habilita el uso controlado de IP/HTTPS para rate limiting y
cookies, sin confiar indiscriminadamente en `X-Forwarded-*`.

Better Auth conserva trusted origins en `WEB_URL`, validación CSRF y cookies
seguras cuando `NODE_ENV=production`. No añadas un dominio de cookie salvo que
el despliegue realmente comparta cookies entre subdominios. El rate limiting de
Better Auth hace login más restrictivo (`10` solicitudes por minuto para las
reglas de sign-in), mientras que la API mantiene `100` solicitudes por minuto y
upload bulk `20` por minuto. Los límites en memoria no son un coordinador
distribuido: con múltiples réplicas, añade una estrategia compartida antes de
tratarlos como límite global.

## 5. Migrar la base de datos

Ejecuta una sola vez, como release/migration job, con la misma configuración de
producción:

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:deploy
```

La secuencia operativa es:

```text
single migration job -> API startup -> Web startup
```

No hagas que cada réplica ejecute migraciones al iniciar. Verifica el resultado
del job antes de poner la API en rotación.

## 6. Desplegar la API

Construye la imagen desde la raíz:

```powershell
docker build -f apps/api/Dockerfile -t payroll-api:<version> .
```

Ejecuta como usuario no-root, inyecta las variables en el runtime, monta un
volumen solo si se necesita storage local en un entorno no productivo y publica
únicamente el puerto HTTP detrás del proxy. El driver de producción debe ser
`s3`; el contenedor no requiere copiar `.env`.

Configura probes:

- `GET /api/health`: liveness; solo indica que el proceso está vivo.
- `GET /api/health/ready`: readiness; valida PostgreSQL.

La readiness no hace un ping a S3 deliberadamente: una caída temporal del
storage no debe retirar toda la API de rotación sin una decisión operativa
explícita. Upload/download/publication deben reportar el error de storage y no
publicar metadata de un archivo cuyo upload no terminó.

## 7. Desplegar Web

Construye el standalone de Next.js con la URL de API correcta en build time:

```powershell
docker build -f apps/web/Dockerfile `
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api `
  -t payroll-web:<version> .
```

Ejecuta como usuario no-root en el puerto `3000`. Los headers de seguridad de
Next.js y la API deben mantenerse activos; el proxy debe conservar HTTPS y no
convertir el origen CORS en `*`.

## 8. Health checks

Antes de habilitar tráfico, confirma que `/api/health` devuelve `200` y que
`/api/health/ready` devuelve `200` con `database: "ok"`. Swagger queda
desactivado en producción salvo una decisión explícita y protegida del equipo.

## 9. Smoke login

Con una cuenta de prueba creada por el proceso administrativo normal:

1. Abre `WEB_URL/login`.
2. Verifica un login correcto con usuario y contraseña.
3. Verifica que una contraseña incorrecta devuelve un error genérico sin enumerar usuarios.
4. Confirma que la cookie de sesión es `Secure` y no aparece en logs.

## 10. Smoke ADMIN

Confirma que un ADMIN puede abrir el workspace de RR. HH., seleccionar un
período, crear/revisar un batch y resolver una excepción. Confirma también que
las acciones quedan auditadas con el actor y sin secretos.

## 11. Smoke EMPLOYEE

Confirma que un EMPLOYEE solo ve `/me/payslips` publicados y que una sesión no
puede consultar el `id` de otro empleado. La autorización debe seguir la cadena
de usuario, employee y payslip del backend; el frontend no es una frontera de
seguridad.

## 12. Upload y publicación

Sube un PDF sintético de prueba a un período de prueba, verifica que el objeto
aparece en el bucket privado con una key opaca, resuelve el matching y publica
el payslip. Si S3 falla durante upload, la operación debe fallar sin dejar DB
afirmando que existe un PDF válido. En replace, el documento nuevo se sube
antes de archivar el anterior; si falla cleanup, se conserva la operación
principal y se registra un warning para limpieza posterior.

## 13. Descarga segura

Desde el portal employee, descarga un payslip publicado y verifica `200`,
`application/pdf` y el contenido esperado. Repite la solicitud sin sesión, con
otro usuario y contra un payslip no publicado; todas deben ser rechazadas. La
implementación actual hace streaming por backend: no persiste signed URLs ni
expone URLs permanentes.

## Backups y recuperación

### PostgreSQL

PostgreSQL requiere backups administrados, pruebas periódicas de restore,
retención y un RPO/RTO acordado. Para una recuperación, restaura primero una
instancia compatible, valida migraciones y conectividad, y ejecuta los smoke
tests antes de redirigir tráfico.

### Object storage

Los PDFs dependen de la persistencia y durabilidad del proveedor S3/R2. Usa sus
controles de versioning, replicación o retención según la política requerida y
prueba que la credencial de runtime puede leer los objetos restaurados.

Restaurar únicamente PostgreSQL no basta: la base puede conservar `storageKey`
de PDFs que ya no existan. Una recuperación válida debe restaurar de forma
coordinada la base y el bucket/prefijo de objetos. Este proyecto no construye
un sistema de backup propio.
