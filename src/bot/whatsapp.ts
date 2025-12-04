import { eq, and, gte } from "drizzle-orm";
import { subscribers, ekadasis, notifications } from "../db/schema.js";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

type Env = {
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_WHATSAPP_FROM: string;
};

const TIMEZONE_OPTIONS: Record<string, string> = {
  "1": "America/Mexico_City",
  "2": "America/Bogota",
  "3": "America/Buenos_Aires",
  "4": "America/Sao_Paulo",
};

/**
 * Maneja mensajes entrantes de WhatsApp via Twilio
 */
export async function handleWhatsAppWebhook(
  body: Record<string, unknown>,
  db: LibSQLDatabase,
  env: Env
): Promise<string> {
  const from = body.From as string; // "whatsapp:+525512345678"
  const message = ((body.Body as string) || "").trim().toUpperCase();

  // Buscar si ya está suscrito
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
  // Selección de timezone (1, 2, 3, 4)
  else if (TIMEZONE_OPTIONS[message]) {
    const selectedTz = TIMEZONE_OPTIONS[message];

    if (isSubscribed) {
      // Actualizar timezone
      await db
        .update(subscribers)
        .set({ timezone: selectedTz })
        .where(eq(subscribers.phone, from));
    } else {
      // Nueva suscripción
      await db.insert(subscribers).values({
        phone: from,
        timezone: selectedTz,
        active: true,
      });
    }

    responseText = `✅ ¡Suscripción confirmada!\n\n🌍 Zona horaria: ${selectedTz}\n\n*Recibirás:*\n• Recordatorio 1 día antes de Ekadasi\n• Horario de paran (ruptura de ayuno)\n\n*Comandos:*\n• PROXIMO - Ver próximo Ekadasi\n• STOP - Cancelar suscripción\n\nHare Krishna! 🙏`;
  }
  // Mensaje inicial o cualquier otro
  else {
    if (isSubscribed) {
      responseText = `🙏 Hare Krishna!\n\nYa estás suscrito (${existingSubscriber[0].timezone}).\n\n*Comandos:*\n• PROXIMO - Ver próximo Ekadasi\n• STOP - Cancelar suscripción\n• 1-4 - Cambiar zona horaria`;
    } else {
      responseText = `🙏 Hare Krishna!\n\nSoy el bot de recordatorios de Ekadasi (Pure Bhakti).\n\n*Selecciona tu zona horaria:*\n\n1️⃣ México (CDMX)\n2️⃣ Colombia/Perú\n3️⃣ Argentina\n4️⃣ Brasil\n\nResponde con el número de tu opción.`;
    }
  }

  // Respuesta en formato TwiML
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(responseText)}</Message>
</Response>`;
}

/**
 * Envía notificaciones a todos los suscriptores
 * Llamado por el cron diario
 */
export async function sendNotifications(
  db: LibSQLDatabase,
  env: Env
): Promise<{ sent: number; errors: number }> {
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Obtener suscriptores activos
  const activeSubscribers = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.active, true));

  let sent = 0;
  let errors = 0;

  for (const subscriber of activeSubscribers) {
    // Buscar ekadasi de mañana para la timezone del usuario
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

      // Verificar si ya se envió esta notificación
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
        const message = `🔔 *Mañana es Ekadasi*\n\n📅 ${e.name}\n🗓️ ${e.date}\n⏰ Ayuno desde la madrugada\n\n🍽️ Paran: ${e.paranStart} - ${e.paranEnd}${e.isDvadasi ? "\n\n📝 Mañana es Dvādaśī - romper con granos" : ""}\n\nHare Krishna! 🙏`;

        try {
          await sendTwilioMessage(subscriber.phone, message, env);

          // Registrar notificación enviada
          await db.insert(notifications).values({
            subscriberId: subscriber.id,
            ekadaisiId: e.id,
            type: "reminder",
          });

          sent++;
        } catch (error) {
          console.error(`Error enviando a ${subscriber.phone}:`, error);
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
        const message = `🍽️ *Hoy puedes romper el ayuno*\n\n⏰ Ventana de paran: ${e.paranStart} - ${e.paranEnd}${e.isDvadasi ? "\n\n📝 Hoy es Dvādaśī - romper con granos" : ""}\n\nHare Krishna! 🙏`;

        try {
          await sendTwilioMessage(subscriber.phone, message, env);

          await db.insert(notifications).values({
            subscriberId: subscriber.id,
            ekadaisiId: e.id,
            type: "paran",
          });

          sent++;
        } catch (error) {
          console.error(`Error enviando a ${subscriber.phone}:`, error);
          errors++;
        }
      }
    }
  }

  return { sent, errors };
}

/**
 * Envía mensaje via Twilio WhatsApp API
 */
async function sendTwilioMessage(to: string, body: string, env: Env): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
    },
    body: new URLSearchParams({
      From: env.TWILIO_WHATSAPP_FROM,
      To: to,
      Body: body,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twilio error: ${error}`);
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
