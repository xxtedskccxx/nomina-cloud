# 🚀 Guía de Producción 24/7 y Estrategia de Ventas a Empresas

Este documento te explica exactamente:
1. **Cómo poner el sistema en la nube** para que funcione las 24 horas del día, los 7 días de la semana, sin depender de tu computadora ni de WSL.
2. **Cómo venderle este sistema a empresas**, cuánto cobrar y cómo cerrar tus primeros clientes.

---

## PARTE 1: PUESTA EN PRODUCCIÓN 24/7 (EN LA NUBE)

Para que el sistema nunca se apague y cualquier empleado pueda entrar desde cualquier lugar del mundo con su celular o computadora, utilizaremos **Railway.app** (la plataforma más sencilla, económica y robusta para este tipo de aplicaciones).

### 📋 Arquitectura de Producción

```
                               ┌────────────────────────────────┐
                               │   Dominio: nomina.cliente.com  │
                               └───────────────┬────────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼                                               ▼
         ┌───────────────────────────┐                   ┌───────────────────────────┐
         │     Frontend Web (Next)   │                   │      Backend API (Nest)   │
         │   (Interfaz del Empleado  │ ◄───────────────► │   (Lógica, Matching PDF   │
         │     y de Recursos Humanos)│                   │       y Seguridad)        │
         └───────────────────────────┘                   └─────────────┬─────────────┘
                                                                       │
                                               ┌───────────────────────┴───────────────────────┐
                                               ▼                                               ▼
                                 ┌───────────────────────────┐                   ┌───────────────────────────┐
                                 │   PostgreSQL (Railway)    │                   │   Cloudflare R2 / AWS S3  │
                                 │ (Usuarios, Roles, Nóminas)│                   │ (Archivos PDF Encriptados)│
                                 └───────────────────────────┘                   └───────────────────────────┘
```

---

### Paso 1: Subir el proyecto a GitHub
1. Si aún no tienes el código en GitHub, crea un repositorio privado en [github.com](https://github.com).
2. Sube la carpeta del proyecto a ese repositorio.

---

### Paso 2: Crear el proyecto en Railway.app
1. Entra en [railway.app](https://railway.app) y regístrate con tu cuenta de GitHub.
2. Haz clic en **"New Project"** -> **"Provision PostgreSQL"**.
   * *Esto crea tu base de datos en la nube en 10 segundos.*
3. Dentro del proyecto, haz clic en **"New"** -> **"GitHub Repo"** y selecciona tu repositorio.
4. Railway detectará el monorepo. Necesitarás dos servicios:
   * **Servicio 1 (API):**
     * En Settings -> *Build Command*: `pnpm --filter @payroll/api build`
     * *Start Command*: `node apps/api/dist/main.js`
     * *Port*: `4000`
   * **Servicio 2 (Web):**
     * En Settings -> *Build Command*: `pnpm --filter @payroll/web build`
     * *Start Command*: `node apps/web/scripts/start-standalone.mjs`
     * *Port*: `3000`

---

### Paso 3: Configurar las Variables de Entorno en Railway
En cada servicio, agrega las variables basándote en el archivo `.env.example`:

| Variable | Dónde obtenerla / Qué poner |
|---|---|
| `DATABASE_URL` | Copias la URL de conexión que te da el PostgreSQL de Railway con 1 clic (`${{Postgres.DATABASE_URL}}`). |
| `BETTER_AUTH_SECRET` | Una cadena aleatoria de 32 caracteres para firmar sesiones. |
| `BETTER_AUTH_URL` | La URL pública de tu API (ej: `https://api.tuempresa.com`). |
| `NEXT_PUBLIC_API_URL` | La URL de la API con `/api` al final (ej: `https://api.tuempresa.com/api`). |
| `WEB_URL` | La URL de tu frontend web (ej: `https://nomina.tuempresa.com`). |
| `PAYSLIP_STORAGE_DRIVER` | `s3` (para producción) o `local` (para pruebas). |

---

### Paso 4: Almacenamiento seguro de PDFs en la nube (Cloudflare R2)
Para no saturar el disco del servidor, los PDFs se guardan en **Cloudflare R2**:
* **Costo:** Gratuito hasta 10 GB de archivos (más de 50.000 PDFs).
* Creas un bucket llamado `nominas-archivos` en Cloudflare.
* Copias el `Access Key ID` y `Secret Access Key` en las variables de entorno de tu API.
* ¡Listo! Los PDFs se guardan automáticamente en la nube cifrados y con respaldo.

---

## PARTE 2: ESTRATEGIA PARA VENDER EL SISTEMA A EMPRESAS

### 🎯 El "Pitch" de Venta (Qué decirle al Dueño o Gerente de RRHH)

> *"Hola [Nombre]. Cada quincena, el equipo de Recursos Humanos pierde horas imprimiendo recibos de nómina, haciéndolos firmar o mandando correos uno por uno. Además, las hojas se pierden y los empleados no tienen privacidad.*
> 
> *Nosotros desarrollamos una plataforma donde Recursos Humanos solo arrastra la carpeta con los PDFs generados por su sistema actual y, en 5 segundos, cada empleado recibe su volante de pago directamente en su celular, organizado por año y quincena, con acceso protegido y desde cualquier lugar.*
> 
> *¿Te gustaría que hagamos una prueba piloto gratuita de 15 días en la próxima quincena para que veas cuánto tiempo le ahorra a tu equipo?"*

---

### 💵 Modelos de Precios Recomendados

#### Modelo A: Suscripción Mensual (SaaS) — *Ideal para ingresos recurrentes*
Cobras una tarifa fija por cada empleado activo en la empresa:

| Tamaño de Empresa | Tarifa por Empleado / Mes | Ingreso Mensual Recurrente |
|---|---|---|
| **Pequeña (15 a 40 empleados)** | $1.20 USD / emp | **$25 - $48 USD / mes** |
| **Mediana (50 a 150 empleados)** | $0.80 USD / emp | **$40 - $120 USD / mes** |
| **Grande (200 a 500 empleados)** | $0.60 USD / emp | **$120 - $300 USD / mes** |

*Con solo 5 empresas medianas de 100 empleados, ganas **$400 - $500 USD al mes** en piloto automático mientras el servidor cuesta $15/mes.*

---

#### Modelo B: Instalación + Soporte (Para clientes tradicionales)
Muchas empresas prefieren pagar una instalación y una cuota fija:
* **Costo de Instalación y Capacitación:** $350 – $800 USD (Pago único).
  * Incluye: Configurarles su propio subdominio (`talento.suempresa.com`), su logo y colores, importar su lista de empleados y capacitar a la persona de RRHH en 30 minutos.
* **Mantenimiento y Hosting Mensual:** $40 – $100 USD / mes.

---

### 📱 Cómo hacer una Demostración que Cierre la Venta en 5 Minutos

1. **Lleva dos pantallas a la reunión:**
   * En tu **laptop**: Abre la vista de Recursos Humanos (`/admin/payslips`).
   * En tu **teléfono**: Ten abierto el portal del empleado (`carlos`).
2. **Pídeles el nombre de un empleado real de ellos:**
   * En vivo, dale a *"Registrar Empleado"* en 20 segundos con ese nombre.
3. **Muestra la magia del PDF:**
   * Toma un archivo PDF de ejemplo nombrado con su código (ej: `Nomina_EMP-001_Quincena.pdf`).
   * Arrástralo a la zona de subida en la laptop.
   * Haz clic en **"Publicar Volantes"**.
4. **El momento cumbre:**
   * Muestra tu teléfono: el volante aparece al instante con el resumen de ingresos, deducciones y botón para descargar en PDF.
   * **Reacción asegurada:** Todo gerente de RRHH queda impresionado con la velocidad y la simpleza visual.

---

### 🔒 Respuestas a Preguntas Frecuentes de Clientes

* **¿Es seguro? ¿Otros empleados pueden ver mi sueldo?**
  * *Respuesta:* *"No. El sistema utiliza aislamiento estricto por usuario y contraseñas cifradas. Cada empleado solo tiene acceso a sus propios recibos y Recursos Humanos controla los accesos."*
* **¿Tenemos que cambiar nuestro sistema contable actual?**
  * *Respuesta:* *"Para nada. Ustedes siguen calculando la nómina en el sistema que ya usan (Profit, Saint, SAP, Excel, etc.) y guardan los PDFs. Nuestra app se encarga únicamente de distribuirlos al instante a los celulares."*
* **¿Qué pasa si un empleado pierde su teléfono?**
  * *Respuesta:* *"Sus volantes no se pierden porque están seguros en la nube. Simplemente inicia sesión desde su nuevo teléfono o desde una computadora."*
