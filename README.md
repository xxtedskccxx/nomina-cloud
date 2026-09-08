# Portal de nómina para empleados

Monorepo de un portal donde Recursos Humanos administra períodos y volantes
PDF externos, y cada empleado consulta únicamente sus propios documentos. El
proyecto no calcula nómina: no incluye `PayrollRun`, impuestos, deducciones ni
prorrateos.

## Arquitectura

- `apps/web`: Next.js 16 con portal de empleado y workspace de RR. HH.
- `apps/api`: NestJS, Better Auth, REST/OpenAPI, auditoría y publicación.
- `packages/database`: Prisma 7 y PostgreSQL.
- `packages/config`: validación Zod de configuración, incluida producción.
- `packages/contracts` y `packages/validation`: contratos y validaciones compartidas.
- `docs/architecture/overview.md`: decisiones de arquitectura existentes.

Los servicios de negocio dependen de la frontera `FileStorage`, no de
filesystem ni de SDKs de proveedores. La implementación se selecciona en el
módulo de storage:

```text
Payslips -> FileStorage -> LocalFileStorage | S3FileStorage
```

## Prerrequisitos e instalación

- Node.js 24 o superior.
- pnpm 11 (`corepack enable`).
- Docker Desktop con Compose.

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

Sustituye `BETTER_AUTH_SECRET` en `.env` por un valor local aleatorio de al
menos 32 caracteres. Nunca uses credenciales de desarrollo en producción.

## PostgreSQL local y Prisma

La configuración de Docker local usa PostgreSQL en `127.0.0.1:5433`, base y
usuario `payroll`, y contraseña `1234`. Son credenciales exclusivas de
desarrollo; el valor está documentado en `.env.example` y no debe reutilizarse
fuera de la máquina local.

```powershell
docker compose up -d
pnpm db:generate
pnpm db:migrate       # desarrollo cuando se crean migraciones nuevas
pnpm db:deploy        # aplicar migraciones existentes
pnpm db:seed          # seed idempotente de desarrollo
```

No ejecutes `prisma migrate reset` en producción. El despliegue usa un único
job de migración (`pnpm db:deploy`) antes de arrancar la API, para que varias
réplicas no intenten migrar simultáneamente.

## Desarrollo

```powershell
docker compose up -d
pnpm dev
```

- Web: <http://localhost:3000>
- API: <http://localhost:4000/api/health>
- Readiness con PostgreSQL: <http://localhost:4000/api/health/ready>
- Swagger en development/test: <http://localhost:4000/api/docs>

`/api/health` solo confirma que la API está viva. `/api/health/ready` consulta
PostgreSQL y devuelve `503` cuando la dependencia no está lista.

## Storage local y S3-compatible

En desarrollo se usa:

```env
PAYSLIP_STORAGE_DRIVER=local
PAYSLIP_STORAGE_ROOT=storage/payslips
```

En producción usa un bucket privado con:

```env
PAYSLIP_STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.example.com
S3_REGION=us-east-1
S3_BUCKET=private-payslips
S3_ACCESS_KEY_ID=replace-me
S3_SECRET_ACCESS_KEY=replace-me
S3_FORCE_PATH_STYLE=false
```

El adaptador usa AWS SDK v3 y funciona con AWS S3, Cloudflare R2 y otros
servicios S3-compatible. La API genera keys internas opacas con UUID; no usa
el filename del cliente como key ni expone URLs permanentes. Las descargas
continúan pasando por el backend, que valida la sesión y la relación
`session.user.id -> Employee.userId -> Employee.id -> Payslip.employeeId`, y
realiza streaming del objeto privado.

Todos los valores permitidos de `PAYSLIP_STORAGE_DRIVER` son únicamente `local`
y `s3`. La API falla rápido si se selecciona `s3` sin las cinco variables
necesarias. Las variables S3 no son necesarias para storage local.

## Variables de entorno y producción

Consulta `.env.example` para el inventario completo. En producción son
obligatorios `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`WEB_URL` y `PAYSLIP_STORAGE_DRIVER`; las URLs públicas deben usar HTTPS. Si
el driver es `s3`, también son obligatorios todos los valores `S3_*`.

`WEB_URL` es el único origen CORS permitido; no se usa `*` con credenciales.
Better Auth mantiene `trustedOrigins` en `WEB_URL` y activa cookies seguras en
producción. `TRUST_PROXY_HOPS` permanece en `0` por defecto; configúralo solo
con el número de saltos de proxy que realmente controles para que IP/rate
limiting y detección HTTPS no confíen en headers arbitrarios.

## Testing y E2E

```powershell
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm test:real
pnpm e2e
pnpm build
pnpm audit --prod
```

`test:real` necesita PostgreSQL local y comprueba Better Auth, persistencia,
roles, períodos y storage. Playwright levanta API/Web según
`playwright.config.ts`, ejecuta desktop y móvil y conserva trace, screenshots,
video y reportes solo cuando hay fallo en CI.

## Docker

Ambas imágenes son multi-stage y ejecutan como usuario no-root. No copian `.env`.

```powershell
docker build -f apps/api/Dockerfile -t payroll-api .
docker build -f apps/web/Dockerfile `
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api `
  -t payroll-web .
```

El contenedor API escucha en `4000`; el Web standalone de Next.js escucha en
`3000`. Inyecta variables de entorno en el runtime del proveedor y ejecuta el
job de migración antes de iniciar la API.

## CI

`.github/workflows/ci.yml` corre en `push` y `pull_request`. El job de calidad
levanta PostgreSQL 16 como service container y ejecuta instalación lockfile,
Prisma generate/deploy, formato, typecheck, lint, unitarias, cobertura, tests
reales, build y `pnpm audit --prod`. Un job separado instala Chromium, siembra
datos sintéticos y ejecuta Playwright; sus artifacts se suben solo en fallo.

Dependabot revisa dependencias pnpm/npm y GitHub Actions semanalmente.

## Checklist de despliegue

1. Provisiona PostgreSQL administrado y configura backups.
2. Provisiona un bucket S3/R2 privado con credenciales de mínimo privilegio.
3. Configura el entorno de producción y URLs HTTPS.
4. Ejecuta una sola migración con `pnpm db:deploy`.
5. Despliega API y verifica liveness/readiness.
6. Despliega Web con `NEXT_PUBLIC_API_URL` apuntando a la API.
7. Ejecuta login y smoke tests de ADMIN, EMPLOYEE, upload, publicación y descarga.
8. Confirma redacción de cookies/auth en logs y política de backups.

El procedimiento detallado y recuperación está en
[`docs/deployment/production.md`](docs/deployment/production.md).
