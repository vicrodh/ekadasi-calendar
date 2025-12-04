import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, and, gte, desc } from "drizzle-orm";
import { ekadasis, subscribers } from "../db/schema.js";
import { generateIcal } from "../ical/generator.js";
import { handleWhatsAppWebhook, sendNotifications } from "../bot/whatsapp.js";

type Bindings = {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_WHATSAPP_FROM: string;
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
      webhook: "/webhook/whatsapp",
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

// POST /cron/notify - Llamado por GitHub Actions para enviar notificaciones
app.post("/cron/notify", async (c) => {
  // Verificar secret para proteger el endpoint
  const secret = c.req.header("X-Cron-Secret");
  if (secret !== c.env.TWILIO_AUTH_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDb(c.env);
  const result = await sendNotifications(db, c.env);

  return c.json(result);
});

// GET /api/subscribers - Listar suscriptores (para admin)
app.get("/api/subscribers", async (c) => {
  const db = getDb(c.env);

  const subs = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.active, true));

  return c.json({
    count: subs.length,
    subscribers: subs.map((s) => ({
      phone: s.phone.replace(/\d{4}$/, "****"), // Ocultar últimos 4 dígitos
      timezone: s.timezone,
      createdAt: s.createdAt,
    })),
  });
});

export default app;
