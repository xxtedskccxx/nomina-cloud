# Arquitectura

La primera fase usa un monolito modular con dos aplicaciones desplegables y
paquetes compartidos:

```text
Web (Next.js)
       ↓ HTTP
API (NestJS + Better Auth)
       ↓ Prisma
PostgreSQL
```

`apps/api` es el límite de entrada para autenticación, HTTP, validación,
observabilidad y módulos de negocio. `packages/database` mantiene un único
`PrismaClient` compartido por la API y la integración de Better Auth.

## Autenticación y dominio

Better Auth administra `User`, `Session`, `Account` y `Verification`. Estos
modelos no representan por sí mismos a un empleado del negocio. `Employee` es
una entidad laboral separada con una relación opcional 1:1 hacia `User`,
manteniendo separadas las responsabilidades de autenticación y dominio.

La base organizacional incluye `Department`, `Position` y `Employee`. Un puesto
puede existir sin departamento para evitar acoplar futuras reasignaciones;
cuando existe la relación es opcional y se conserva como `NULL` si el
departamento se desactiva o se elimina. Las relaciones de empleado hacia
departamento, puesto y usuario usan `ON DELETE SET NULL`.

Los cambios estructurales se versionan con Prisma Migrate. La base existente se
baselined con `00000000000000_baseline` mediante `migrate resolve`, sin ejecutar
la creación de tablas sobre los datos actuales; los cambios siguientes deben
generarse como migraciones versionadas.

Los listados usan índices derivados de sus filtros: `Employee.status`,
`Employee.departmentId`, `Employee.positionId` y el compuesto
`Position.departmentId + isActive`. Los códigos laborales y el vínculo 1:1 con
usuario son únicos y sus índices cubren también las búsquedas exactas.

Los roles preparados para el producto son `ADMIN` y `EMPLOYEE`. La frontera de
`apps/api/src/auth` expone conceptos de aplicación como usuario actual, id del
usuario y autorización por rol sin propagar detalles del adaptador por el resto
del sistema.

## Employment y compensación

`Employee` identifica a la persona y conserva su asignación organizacional
actual (`Department` y `Position`). `Employment` representa cada relación
laboral histórica con `employmentType`, fechas de vigencia y estado contractual.
`Compensation` pertenece a un `Employment` y conserva el historial de salario
base sin sobrescribir registros anteriores.

`Employee.status` continúa siendo el estado general de la ficha (`ACTIVE`,
`INACTIVE`, `TERMINATED`); `Employment.status` describe exclusivamente la
relación contractual (`ACTIVE`, `ENDED`). No se sincronizan automáticamente:
un employment terminado no borra ni cambia la identidad laboral del empleado.
La aplicación limita a un employment activo por empleado y la base lo refuerza
con un índice único parcial.

Las fechas laborales (`startDate`, `endDate`, `effectiveFrom`, `effectiveTo`)
se almacenan como PostgreSQL `DATE` y se reciben/devuelven como `YYYY-MM-DD`.
`effectiveTo` es inclusivo, por lo que un aumento el `2026-07-01` cierra el
registro anterior el `2026-06-30`. Cada cambio salarial bloquea el employment,
valida solapamientos y cierra el registro abierto dentro de una única
transacción.

El dinero se almacena como `DECIMAL(18,2)`, nunca como `Float`. Los contratos
JSON serializan `amount` como string, por ejemplo `{ "amount": "60000.00", "currency": "DOP" }`.
`currency` usa códigos ISO 4217 de tres letras; inicialmente se documentan
`DOP`, `USD` y `EUR`, sin conversión FX. `MONTHLY`, `BIWEEKLY`, `WEEKLY` y
`HOURLY` describen la frecuencia declarada del monto; `BIWEEKLY` significa cada
dos semanas, no bimensual.

## Configuración, períodos y población

`PayrollConfiguration` define una corrida conceptual de nómina con código
único, moneda, frecuencia y estado activo. La frecuencia de configuración es
la frecuencia esperada del proceso; no se fuerza compatibilidad con cada
`Compensation` histórica y todavía no existen conversiones. La desactivación
es reversible y evita nuevas altas sin borrar historial. Cuando una
configuración ya tiene períodos, la API solo permite modificar su nombre y
`isActive`, protegiendo la semántica histórica de código, moneda y frecuencia.

`PayrollPeriod` usa `DATE` para `startDate`, `endDate` y `paymentDate`. La API
valida que el inicio no supere el fin y que la fecha de pago no sea anterior al
fin; PostgreSQL también aplica un `CHECK`. Un lock de fila sobre la
configuración serializa altas y actualizaciones para que la comprobación de
solapamiento sea segura ante concurrencia. La unicidad del código de período
es por configuración, y la unicidad de participante es `(payrollPeriodId,
employeeId)`.

El lifecycle deliberadamente no tiene `CLOSED`: por ahora los únicos estados
son `DRAFT`, `OPEN` y `LOCKED`. Abrir, bloquear y reabrir son comandos
explícitos; no existe un `PATCH` arbitrario de estado. `LOCKED` conserva
timestamps e ids de usuario para apertura, bloqueo y reapertura. `CLOSED` se
incorporará junto con `PayrollRun`, resultados y reglas de reapertura reales.

`PayrollParticipant` es una referencia/snapshot de ids, no una copia de
salario. El refresh selecciona employments con la intersección inclusiva
`startDate <= period.endDate` y `(endDate IS NULL OR endDate >=
period.startDate)`. Empleos futuros quedan fuera; un employment terminado que
intersecta sí entra. Si hay varias relaciones elegibles de una persona, se
elige una única relación activa; si la situación continúa ambigua, el refresh
falla de forma explícita para no inventar una vinculación.

La cobertura salarial se persiste como `NONE`, `SINGLE` o `MULTIPLE`. Solo se
guarda `compensationId` cuando exactamente un registro cubre todo el período.
Un cambio de salario dentro del rango deja `compensationId = NULL` y marca
`MULTIPLE`; no se calcula prorrateo, bruto, neto, impuestos ni deducciones.

## Documentos, batches y nómina

El sistema **no calcula la nómina**. Recursos Humanos ya posee los PDFs y la
plataforma se encargará posteriormente de almacenarlos, asociarlos a empleados
y períodos, publicarlos y controlar el acceso.

Payslip representa el PDF almacenado y publicado; no contiene importes
calculados. `PayslipUploadBatch` representa una sesión de carga masiva y
`PayslipUploadItem` conserva el resultado individual de cada archivo. El
batch puede quedar `PROCESSING`, `READY`, `PARTIAL`,
`NEEDS_REVIEW`, `FAILED` o `COMPLETED`; un fallo no bloquea los items completados.
Los PDFs válidos se guardan primero con una clave temporal para que los items
fallidos puedan reintentarse sin duplicar los éxitos. La unicidad por checksum
dentro del batch y la unicidad activa por empleado/período hacen idempotente la
carga.

El matching automático solo acepta códigos de empleado inequívocos. `EXACT`
conserva el código delimitado; `NORMALIZED` acepta variaciones deterministas
como `EMP00001` para `EMP-00001`. Los nombres de personas nunca se usan
para adivinar una asignación. Los casos desconocidos o ambiguos quedan en
revisión y el matching manual cambia explícitamente el método a
`MANUAL`.

La completitud de período deriva `expected` desde `PayrollParticipant`,
`uploaded` desde los documentos activos asociados, `published` desde los
publicados y `missing` desde participantes sin documento activo. Los listados solo
entregan metadata; los bytes del PDF se leen exclusivamente en el
viewer/download. El historial de batches está paginado.

Después de publicar, `PayslipPublicationService` emite el evento local
`PayslipPublished` a `NotificationService`. La implementación actual solo
registra metadata operacional (sin PDF, credenciales ni datos financieros) y
no envía correo hasta configurar un proveedor.

En esta fase el flujo será:

```text
API
 ↓
Almacenamiento privado local (intercambiable por R2/S3 posteriormente)
```

CSV y ZIP no se habilitan todavía: el matching por filename ya cubre el flujo
operativo y posponer ambos evita añadir una superficie de parsing y extracción
antes de contar con límites y fixtures de seguridad específicos. OCR, cálculos,
motor de nómina, entrega de correo y el estado `CLOSED` siguen fuera de alcance.
