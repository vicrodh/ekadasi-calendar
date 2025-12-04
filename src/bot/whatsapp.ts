import { eq, and, gte } from "drizzle-orm";
import { subscribers, ekadasis, notifications } from "../db/schema.js";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

type Env = {
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_WHATSAPP_FROM: string;
};

// Template SIDs de Twilio
const TEMPLATES = {
  ekadasi_reminder: "HX8d07acbf35e61527c1fcba8e2e8da630",
  paran_reminder: "HX9b7443506e6fabf7b9073579c07e80b7",
  ekadasi_postponed: "HXf43a00f3c10064a7acab4110d8ef9d7f",
};

// Ciudades de México disponibles
const LOCATION_OPTIONS: Record<string, { tz: string; label: string }> = {
  "1": { tz: "America/Mexico_City", label: "CDMX" },
  "2": { tz: "America/Mexico_City", label: "Guadalajara" },
  "3": { tz: "America/Mexico_City", label: "Monterrey" },
  "4": { tz: "America/Mexico_City", label: "Otra ciudad de México" },
};

/**
 * Maneja mensajes entrantes de WhatsApp via Twilio
 */
export async function handleWhatsAppWebhook(
  body: Record<string, unknown>,
  db: LibSQLDatabase,
  env: Env
): Promise<string> {
  const from = body.From as string;
  const message = ((body.Body as string) || "").trim().toUpperCase();

  const existingSubscriber = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.phone, from))
    .limit(1);

  const isSubscribed = existingSubscriber.length > 0 && existingSubscriber[0].active;

  let responseText = "";

  // Comando: STOP - Cancelar suscripción
  if (message === "STOP" || message === "SALIR" || message === "CANCELAR") {
    if (isSubscribed) {
      await db
        .update(subscribers)
        .set({ active: false })
        .where(eq(subscribers.phone, from));
      responseText = "✅ Has cancelado tu suscripción. Ya no recibirás recordatorios.\n\nPuedes volver a suscribirte en cualquier momento enviando un mensaje.";
    } else {
      responseText = "No tienes una suscripción activa.";
    }
  }
  // Comando: PROXIMO - Ver próximo ekadasi
  else if (message === "PROXIMO" || message === "PRÓXIMO" || message === "NEXT") {
    const tz = isSubscribed ? existingSubscriber[0].timezone : "America/Mexico_City";
    const today = new Date().toISOString().split("T")[0];

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

    if (next.length > 0) {
      const e = next[0];
      responseText = `🌙 *Próximo Ekadasi*\n\n📅 ${e.name}\n🗓️ ${e.date}\n\n🍽️ Paran: ${e.paranStart} - ${e.paranEnd}${e.notes ? `\n\n📝 ${e.notes}` : ""}`;
    } else {
      responseText = "No hay información de próximos ekadasis. Por favor intenta más tarde.";
    }
  }
  // Selección de ubicación (1, 2, 3, 4)
  else if (LOCATION_OPTIONS[message]) {
    const selected = LOCATION_OPTIONS[message];

    if (isSubscribed) {
      await db
        .update(subscribers)
        .set({ timezone: selected.tz })
        .where(eq(subscribers.phone, from));
    } else {
      await db.insert(subscribers).values({
        phone: from,
        timezone: selected.tz,
        active: true,
      });
    }

    responseText = `✅ ¡Suscripción confirmada!\n\n📍 Ubicación: ${selected.label}\n\n*Recibirás:*\n• Recordatorio 1 día antes de Ekadasi\n• Horario de paran (ruptura de ayuno)\n\n*Comandos:*\n• PROXIMO - Ver próximo Ekadasi\n• STOP - Cancelar suscripción\n\nHare Krishna! 🙏`;
  }
  // Mensaje inicial o cualquier otro
  else {
    if (isSubscribed) {
      responseText = `🙏 Hare Krishna!\n\nYa estás suscrito.\n\n*Comandos:*\n• PROXIMO - Ver próximo Ekadasi\n• STOP - Cancelar suscripción`;
    } else {
      responseText = `🙏 Hare Krishna!\n\nSoy el bot de recordatorios de Ekadasi (Pure Bhakti).\n\n*Selecciona tu ciudad:*\n\n1️⃣ CDMX\n2️⃣ Guadalajara\n3️⃣ Monterrey\n4️⃣ Otra ciudad de México\n\nResponde con el número.`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(responseText)}</Message>
</Response>`;
}

/**
 * Envía notificaciones a todos los suscriptores usando templates
 * Llamado por el cron diario
 */
export async function sendNotifications(
  db: LibSQLDatabase,
  env: Env
): Promise<{ sent: number; errors: number }> {
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const activeSubscribers = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.active, true));

  let sent = 0;
  let errors = 0;

  for (const subscriber of activeSubscribers) {
    // Buscar ekadasi de mañana
    const tomorrowEkadasi = await db
      .select()
      .from(ekadasis)
      .where(
        and(
          eq(ekadasis.timezone, subscriber.timezone),
          eq(ekadasis.date, tomorrow)
        )
      )
      .limit(1);

    if (tomorrowEkadasi.length > 0) {
      const e = tomorrowEkadasi[0];

      const alreadySent = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.subscriberId, subscriber.id),
            eq(notifications.ekadaisiId, e.id),
            eq(notifications.type, "reminder")
          )
        )
        .limit(1);

      if (alreadySent.length === 0) {
        try {
          // Usar template ekadasi_reminder
          // Variables: {{1}} = nombre y fecha, {{2}} = hora inicio, {{3}} = hora fin
          await sendTwilioTemplate(
            subscriber.phone,
            TEMPLATES.ekadasi_reminder,
            [
              `${e.name} - ${formatDate(e.date)}`,
              e.paranStart,
              e.paranEnd,
            ],
            env
          );

          await db.insert(notifications).values({
            subscriberId: subscriber.id,
            ekadaisiId: e.id,
            type: "reminder",
          });

          sent++;
        } catch (error) {
          console.error(`Error enviando reminder a ${subscriber.phone}:`, error);
          errors++;
        }
      }
    }

    // Buscar si hoy es día de paran
    const todayParan = await db
      .select()
      .from(ekadasis)
      .where(
        and(
          eq(ekadasis.timezone, subscriber.timezone),
          eq(ekadasis.paranDate, today)
        )
      )
      .limit(1);

    if (todayParan.length > 0) {
      const e = todayParan[0];

      const alreadySent = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.subscriberId, subscriber.id),
            eq(notifications.ekadaisiId, e.id),
            eq(notifications.type, "paran")
          )
        )
        .limit(1);

      if (alreadySent.length === 0) {
        try {
          // Usar template paran_reminder
          // Variables: {{1}} = hora inicio, {{2}} = hora fin
          await sendTwilioTemplate(
            subscriber.phone,
            TEMPLATES.paran_reminder,
            [e.paranStart, e.paranEnd],
            env
          );

          await db.insert(notifications).values({
            subscriberId: subscriber.id,
            ekadaisiId: e.id,
            type: "paran",
          });

          sent++;
        } catch (error) {
          console.error(`Error enviando paran a ${subscriber.phone}:`, error);
          errors++;
        }
      }
    }
  }

  return { sent, errors };
}

/**
 * Envía mensaje usando Twilio Content Template API
 */
async function sendTwilioTemplate(
  to: string,
  contentSid: string,
  variables: string[],
  env: Env
): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;

  // Construir objeto de variables para el template
  const contentVariables: Record<string, string> = {};
  variables.forEach((val, idx) => {
    contentVariables[(idx + 1).toString()] = val;
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
    },
    body: new URLSearchParams({
      From: env.TWILIO_WHATSAPP_FROM,
      To: to,
      ContentSid: contentSid,
      ContentVariables: JSON.stringify(contentVariables),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twilio error: ${error}`);
  }
}

function formatDate(dateISO: string): string {
  const [year, month, day] = dateISO.split("-");
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${parseInt(day)} de ${months[parseInt(month) - 1]}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
