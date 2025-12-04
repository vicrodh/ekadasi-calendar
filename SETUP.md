# Guía de Configuración - Ekadasi Calendar Bot

## Pasos Manuales Requeridos

### 1. Crear Base de Datos en Turso (5 min)

```bash
# Instalar Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Autenticarse
turso auth signup  # o `turso auth login` si ya tienes cuenta

# Crear base de datos
turso db create ekadasi-calendar

# Obtener URL de conexión
turso db show ekadasi-calendar --url
# Resultado: libsql://ekadasi-calendar-tu-usuario.turso.io

# Crear token de acceso
turso db tokens create ekadasi-calendar
# Guarda este token, lo necesitarás
```

### 2. Crear Cuenta en Twilio (10 min)

1. Ve a [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Crea cuenta gratuita (sin tarjeta de crédito)
3. Verifica tu número de teléfono
4. Ve a **Console Dashboard**
5. Copia tu `Account SID` y `Auth Token`

#### Activar WhatsApp Sandbox:

1. Ve a **Messaging > Try it out > Send a WhatsApp message**
2. Escanea el QR o envía el código al número indicado
3. Guarda el número de sandbox: `whatsapp:+14155238886`

#### Configurar Webhook:

1. En el sandbox, configura el webhook:
   - **When a message comes in**: `https://ekadasi-calendar.TU-USUARIO.workers.dev/webhook/whatsapp`
   - Método: POST

### 3. Configurar Variables de Entorno

#### Para desarrollo local:

Crea archivo `.env`:
```bash
cp .env.example .env
# Edita con tus valores
```

#### Para Cloudflare Workers:

```bash
# Agregar secrets
wrangler secret put TURSO_DATABASE_URL
wrangler secret put TURSO_AUTH_TOKEN
wrangler secret put TWILIO_ACCOUNT_SID
wrangler secret put TWILIO_AUTH_TOKEN
wrangler secret put TWILIO_WHATSAPP_FROM
```

#### Para GitHub Actions:

Ve a tu repositorio > Settings > Secrets and variables > Actions

Agrega estos secrets:
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `TWILIO_AUTH_TOKEN`
- `WORKER_URL` (ej: `https://ekadasi-calendar.tu-usuario.workers.dev`)

### 4. Desplegar

```bash
# Instalar dependencias
bun install

# Generar migraciones
bun run db:generate

# Ejecutar migraciones
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... bun run db:migrate

# Desplegar a Cloudflare
bun run deploy
```

---

## Estructura del Proyecto

```
ekadasi-calendar/
├── src/
│   ├── api/          # Endpoints Hono.js
│   │   └── index.ts  # Router principal
│   ├── bot/          # Lógica del bot WhatsApp
│   │   └── whatsapp.ts
│   ├── db/           # Schema Drizzle
│   │   └── schema.ts
│   ├── ical/         # Generador de calendario
│   │   └── generator.ts
│   └── scraper/      # Scraper de purebhakti.com
│       └── index.ts
├── scripts/
│   └── migrate.ts    # Script de migración
├── .github/
│   └── workflows/
│       └── scrape.yml # Cron diario
├── wrangler.toml     # Config Cloudflare
├── drizzle.config.ts # Config Drizzle
└── package.json
```

---

## Endpoints Disponibles

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/api/ekadasi?tz=America/Mexico_City` | GET | Lista próximos ekadasis |
| `/api/ekadasi/next?tz=...` | GET | Solo el próximo ekadasi |
| `/calendar.ics?tz=...` | GET | Feed iCal suscribible |
| `/webhook/whatsapp` | POST | Webhook de Twilio |
| `/cron/notify` | POST | Trigger de notificaciones |
| `/api/subscribers` | GET | Lista suscriptores (admin) |

---

## Uso del Bot

Los usuarios interactúan enviando mensajes al número de WhatsApp:

| Comando | Acción |
|---------|--------|
| Cualquier mensaje inicial | Muestra menú de suscripción |
| `1`, `2`, `3`, `4` | Selecciona zona horaria |
| `PROXIMO` | Muestra próximo ekadasi |
| `STOP` | Cancela suscripción |

---

## Suscribirse al Calendario iCal

Los usuarios pueden agregar el calendario a sus apps:

**URL del calendario:**
```
https://ekadasi-calendar.tu-usuario.workers.dev/calendar.ics?tz=America/Mexico_City
```

### Google Calendar:
1. Configuración > Añadir calendario > Desde URL
2. Pegar la URL

### Apple Calendar (iPhone/Mac):
1. Ajustes > Calendario > Cuentas > Añadir cuenta
2. Otro > Añadir suscripción de calendario
3. Pegar la URL

### Outlook:
1. Agregar calendario > Suscribirse desde la web
2. Pegar la URL

---

## Costos Estimados

| Servicio | Uso (10 usuarios) | Costo |
|----------|-------------------|-------|
| Cloudflare Workers | ~500 req/mes | $0 |
| Turso | ~5MB | $0 |
| GitHub Actions | 30 ejecuciones/mes | $0 |
| Twilio | ~20 msgs/mes | ~$0.20 |

**Total: ~$0.20/mes** (o $10 prepago que dura años)
