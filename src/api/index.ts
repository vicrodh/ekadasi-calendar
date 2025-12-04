import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, and, gte, desc } from "drizzle-orm";
import { ekadasis, subscribers, telegramSubscribers } from "../db/schema.js";
import { generateIcal } from "../ical/generator.js";
import { handleWhatsAppWebhook, sendNotifications } from "../bot/whatsapp.js";
import { handleTelegramWebhook, sendTelegramNotifications } from "../bot/telegram.js";

type Bindings = {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_WHATSAPP_FROM: string;
  TELEGRAM_BOT_TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS para que el calendario sea accesible
app.use("*", cors());

// Helper para crear conexión a DB
function getDb(env: Bindings) {
  const client = createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
  return drizzle(client);
}

// Health check
app.get("/", (c) => {
  return c.json({
    status: "ok",
    service: "Ekadasi Calendar API",
    endpoints: {
      calendar: "/api/ekadasi?tz=America/Mexico_City",
      ical: "/calendar.ics?tz=America/Mexico_City",
      whatsapp: "/webhook/whatsapp",
      telegram: "/webhook/telegram",
    },
  });
});

// GET /api/ekadasi - Obtener próximos ekadasis
app.get("/api/ekadasi", async (c) => {
  const tz = c.req.query("tz") || "America/Mexico_City";
  const today = new Date().toISOString().split("T")[0];

  const db = getDb(c.env);

  const upcoming = await db
    .select()
    .from(ekadasis)
    .where(
      and(
        eq(ekadasis.timezone, tz),
        gte(ekadasis.date, today)
      )
    )
    .orderBy(ekadasis.date)
    .limit(10);

  return c.json({
    timezone: tz,
    count: upcoming.length,
    ekadasis: upcoming,
  });
});

// GET /api/ekadasi/next - Obtener solo el próximo ekadasi
app.get("/api/ekadasi/next", async (c) => {
  const tz = c.req.query("tz") || "America/Mexico_City";
  const today = new Date().toISOString().split("T")[0];

  const db = getDb(c.env);

  const next = await db
    .select()
    .from(ekadasis)
    .where(
      and(
        eq(ekadasis.timezone, tz),
        gte(ekadasis.date, today)
      )
    )
    .orderBy(ekadasis.date)
    .limit(1);

  if (next.length === 0) {
    return c.json({ error: "No hay ekadasis próximos" }, 404);
  }

  return c.json(next[0]);
});

// GET /calendar.ics - Feed iCal suscribible
app.get("/calendar.ics", async (c) => {
  const tz = c.req.query("tz") || "America/Mexico_City";

  const db = getDb(c.env);

  const allEkadasis = await db
    .select()
    .from(ekadasis)
    .where(eq(ekadasis.timezone, tz))
    .orderBy(ekadasis.date);

  const ical = generateIcal(allEkadasis, tz);

  return c.body(ical, 200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'attachment; filename="ekadasi-calendar.ics"',
  });
});

// POST /webhook/whatsapp - Recibir mensajes de Twilio
app.post("/webhook/whatsapp", async (c) => {
  const db = getDb(c.env);
  const body = await c.req.parseBody();

  const response = await handleWhatsAppWebhook(body, db, c.env);

  // Twilio espera TwiML como respuesta
  return c.body(response, 200, {
    "Content-Type": "text/xml",
  });
});

// POST /webhook/telegram - Recibir mensajes de Telegram
app.post("/webhook/telegram", async (c) => {
  const db = getDb(c.env);
  const update = await c.req.json();

  await handleTelegramWebhook(update, db, c.env);

  // Telegram espera 200 OK
  return c.json({ ok: true });
});

// GET /telegram/setup - Registrar webhook con Telegram (llamar una vez)
app.get("/telegram/setup", async (c) => {
  const webhookUrl = "https://ekadasi-api.bhaktilatam.com/webhook/telegram";
  const url = `https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;

  const response = await fetch(url);
  const result = await response.json();

  return c.json(result);
});

// POST /cron/notify - Llamado por GitHub Actions para enviar notificaciones
app.post("/cron/notify", async (c) => {
  // Verificar secret para proteger el endpoint
  const secret = c.req.header("X-Cron-Secret");
  if (secret !== c.env.TWILIO_AUTH_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDb(c.env);

  // Enviar notificaciones de WhatsApp
  const whatsappResult = await sendNotifications(db, c.env);

  // Enviar notificaciones de Telegram
  const telegramResult = await sendTelegramNotifications(db, c.env);

  return c.json({
    whatsapp: whatsappResult,
    telegram: telegramResult,
  });
});

// GET /api/subscribers - Listar suscriptores (para admin)
app.get("/api/subscribers", async (c) => {
  const db = getDb(c.env);

  const whatsappSubs = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.active, true));

  const telegramSubs = await db
    .select()
    .from(telegramSubscribers)
    .where(eq(telegramSubscribers.active, true));

  return c.json({
    whatsapp: {
      count: whatsappSubs.length,
      subscribers: whatsappSubs.map((s) => ({
        phone: s.phone.replace(/\d{4}$/, "****"),
        timezone: s.timezone,
        createdAt: s.createdAt,
      })),
    },
    telegram: {
      count: telegramSubs.length,
      subscribers: telegramSubs.map((s) => ({
        username: s.username ? `@${s.username}` : s.firstName || "Anonymous",
        timezone: s.timezone,
        language: s.language,
        createdAt: s.createdAt,
      })),
    },
  });
});

export default app;
