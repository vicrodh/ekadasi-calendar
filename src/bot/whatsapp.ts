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

// Base de datos de ciudades con aliases para fuzzy matching
const CITIES_DB: Array<{
  tz: string;
  label: string;
  aliases: string[];
  country: string;
}> = [
  // México
  { tz: "America/Mexico_City", label: "Ciudad de México", aliases: ["cdmx", "df", "mexico city", "ciudad de mexico", "mexico df", "distrito federal"], country: "México" },
  { tz: "America/Mexico_City", label: "Guadalajara", aliases: ["guadalajara", "gdl", "jalisco"], country: "México" },
  { tz: "America/Monterrey", label: "Monterrey", aliases: ["monterrey", "mty", "nuevo leon"], country: "México" },
  { tz: "America/Mexico_City", label: "Puebla", aliases: ["puebla"], country: "México" },
  { tz: "America/Tijuana", label: "Tijuana", aliases: ["tijuana", "tj", "baja california"], country: "México" },
  { tz: "America/Mexico_City", label: "León", aliases: ["leon", "guanajuato"], country: "México" },
  { tz: "America/Mexico_City", label: "Zacatecas", aliases: ["zacatecas"], country: "México" },
  { tz: "America/Mexico_City", label: "Ciudad Victoria", aliases: ["ciudad victoria", "victoria", "tamaulipas"], country: "México" },
  { tz: "America/Mexico_City", label: "Querétaro", aliases: ["queretaro", "qro"], country: "México" },
  { tz: "America/Mexico_City", label: "Mérida", aliases: ["merida", "yucatan"], country: "México" },
  { tz: "America/Cancun", label: "Cancún", aliases: ["cancun", "quintana roo", "playa del carmen"], country: "México" },
  { tz: "America/Mexico_City", label: "Morelia", aliases: ["morelia", "michoacan"], country: "México" },
  { tz: "America/Mexico_City", label: "Oaxaca", aliases: ["oaxaca"], country: "México" },
  { tz: "America/Mexico_City", label: "Veracruz", aliases: ["veracruz"], country: "México" },
  { tz: "America/Hermosillo", label: "Hermosillo", aliases: ["hermosillo", "sonora"], country: "México" },
  { tz: "America/Chihuahua", label: "Chihuahua", aliases: ["chihuahua"], country: "México" },
  { tz: "America/Mazatlan", label: "Mazatlán", aliases: ["mazatlan", "sinaloa", "culiacan"], country: "México" },

  // Sudamérica
  { tz: "America/Lima", label: "Lima", aliases: ["lima", "peru", "perú"], country: "Perú" },
  { tz: "America/Bogota", label: "Bogotá", aliases: ["bogota", "colombia", "medellin", "cali"], country: "Colombia" },
  { tz: "America/Santiago", label: "Santiago", aliases: ["santiago", "chile"], country: "Chile" },
  { tz: "America/Argentina/Buenos_Aires", label: "Buenos Aires", aliases: ["buenos aires", "argentina", "bsas"], country: "Argentina" },
  { tz: "America/Sao_Paulo", label: "São Paulo", aliases: ["sao paulo", "brasil", "brazil", "rio de janeiro", "rio"], country: "Brasil" },
  { tz: "America/Caracas", label: "Caracas", aliases: ["caracas", "venezuela"], country: "Venezuela" },
  { tz: "America/Guayaquil", label: "Ecuador", aliases: ["quito", "guayaquil", "ecuador"], country: "Ecuador" },
  { tz: "America/La_Paz", label: "Bolivia", aliases: ["la paz", "bolivia", "santa cruz"], country: "Bolivia" },
  { tz: "America/Asuncion", label: "Paraguay", aliases: ["asuncion", "paraguay"], country: "Paraguay" },
  { tz: "America/Montevideo", label: "Uruguay", aliases: ["montevideo", "uruguay"], country: "Uruguay" },

  // Centroamérica y Caribe
  { tz: "America/Guatemala", label: "Guatemala", aliases: ["guatemala"], country: "Guatemala" },
  { tz: "America/Costa_Rica", label: "Costa Rica", aliases: ["costa rica", "san jose"], country: "Costa Rica" },
  { tz: "America/Panama", label: "Panamá", aliases: ["panama"], country: "Panamá" },
  { tz: "America/Havana", label: "Cuba", aliases: ["habana", "cuba", "la habana"], country: "Cuba" },
  { tz: "America/Santo_Domingo", label: "Rep. Dominicana", aliases: ["santo domingo", "dominicana", "republica dominicana"], country: "Rep. Dominicana" },
  { tz: "America/Puerto_Rico", label: "Puerto Rico", aliases: ["puerto rico", "san juan"], country: "Puerto Rico" },
  { tz: "America/El_Salvador", label: "El Salvador", aliases: ["el salvador", "salvador"], country: "El Salvador" },
  { tz: "America/Tegucigalpa", label: "Honduras", aliases: ["honduras", "tegucigalpa"], country: "Honduras" },
  { tz: "America/Managua", label: "Nicaragua", aliases: ["nicaragua", "managua"], country: "Nicaragua" },

  // Estados Unidos
  { tz: "America/Los_Angeles", label: "Los Ángeles", aliases: ["los angeles", "la", "california", "san francisco", "san diego"], country: "USA" },
  { tz: "America/Chicago", label: "Chicago", aliases: ["chicago", "houston", "dallas", "texas", "austin"], country: "USA" },
  { tz: "America/New_York", label: "Nueva York", aliases: ["new york", "nueva york", "nyc", "miami", "florida", "boston", "washington"], country: "USA" },
  { tz: "America/Denver", label: "Denver", aliases: ["denver", "colorado", "phoenix", "arizona"], country: "USA" },

  // Europa
  { tz: "Europe/Madrid", label: "España", aliases: ["madrid", "españa", "spain", "barcelona", "valencia", "sevilla"], country: "España" },
  { tz: "Europe/London", label: "Reino Unido", aliases: ["london", "londres", "uk", "reino unido", "england", "manchester"], country: "UK" },
  { tz: "Europe/Paris", label: "Francia", aliases: ["paris", "francia", "france"], country: "Francia" },
  { tz: "Europe/Berlin", label: "Alemania", aliases: ["berlin", "alemania", "germany", "munich"], country: "Alemania" },
  { tz: "Europe/Rome", label: "Italia", aliases: ["roma", "italia", "italy", "milan"], country: "Italia" },
  { tz: "Europe/Amsterdam", label: "Países Bajos", aliases: ["amsterdam", "holanda", "netherlands", "paises bajos"], country: "Países Bajos" },
  { tz: "Europe/Lisbon", label: "Portugal", aliases: ["lisboa", "portugal", "lisbon"], country: "Portugal" },

  // Asia
  { tz: "Asia/Kolkata", label: "India", aliases: ["india", "vrindavan", "vrindavana", "mathura", "delhi", "mumbai", "kolkata", "mayapur", "navadvipa"], country: "India" },
  { tz: "Asia/Tokyo", label: "Japón", aliases: ["tokyo", "japon", "japan"], country: "Japón" },
  { tz: "Asia/Shanghai", label: "China", aliases: ["china", "beijing", "shanghai"], country: "China" },
  { tz: "Asia/Singapore", label: "Singapur", aliases: ["singapore", "singapur"], country: "Singapur" },
  { tz: "Asia/Dubai", label: "Emiratos Árabes", aliases: ["dubai", "uae", "emiratos"], country: "EAU" },

  // Oceanía
  { tz: "Australia/Sydney", label: "Australia", aliases: ["australia", "sydney", "melbourne"], country: "Australia" },
  { tz: "Pacific/Auckland", label: "Nueva Zelanda", aliases: ["nueva zelanda", "new zealand", "auckland"], country: "Nueva Zelanda" },

  // África
  { tz: "Africa/Johannesburg", label: "Sudáfrica", aliases: ["sudafrica", "south africa", "johannesburg", "cape town"], country: "Sudáfrica" },
];

// Normaliza texto para comparación (quita acentos, minúsculas)
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// Busca la mejor coincidencia de ciudad
function findCity(input: string): { tz: string; label: string; country: string } | null {
  const normalized = normalizeText(input);

  if (!normalized || normalized.length < 2) return null;

  // Búsqueda exacta primero
  for (const city of CITIES_DB) {
    if (normalizeText(city.label) === normalized) {
      return city;
    }
    for (const alias of city.aliases) {
      if (normalizeText(alias) === normalized) {
        return city;
      }
    }
  }

  // Búsqueda parcial (contiene)
  for (const city of CITIES_DB) {
    if (normalizeText(city.label).includes(normalized) || normalized.includes(normalizeText(city.label))) {
      return city;
    }
    for (const alias of city.aliases) {
      if (normalizeText(alias).includes(normalized) || normalized.includes(normalizeText(alias))) {
        return city;
      }
    }
  }

  return null;
}

// Opciones numéricas rápidas (retrocompatibilidad)
const QUICK_OPTIONS: Record<string, { tz: string; label: string }> = {
  "1": { tz: "America/Mexico_City", label: "Ciudad de México" },
  "2": { tz: "America/Mexico_City", label: "Guadalajara" },
  "3": { tz: "America/Monterrey", label: "Monterrey" },
  "4": { tz: "Asia/Kolkata", label: "India (Vṛndāvan)" },
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
  // Selección rápida por número (1, 2, 3, 4)
  else if (QUICK_OPTIONS[message]) {
    const selected = QUICK_OPTIONS[message];

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
  // Búsqueda inteligente de ciudad
  else {
    const originalMessage = ((body.Body as string) || "").trim();
    const foundCity = findCity(originalMessage);

    if (foundCity) {
      // Ciudad encontrada - suscribir
      if (isSubscribed) {
        await db
          .update(subscribers)
          .set({ timezone: foundCity.tz })
          .where(eq(subscribers.phone, from));
      } else {
        await db.insert(subscribers).values({
          phone: from,
          timezone: foundCity.tz,
          active: true,
        });
      }

      responseText = `✅ ¡Suscripción confirmada!\n\n📍 ${foundCity.label}, ${foundCity.country}\n\n*Recibirás:*\n• Recordatorio 1 día antes de Ekadasi\n• Horario de paran (ruptura de ayuno)\n\n*Comandos:*\n• PROXIMO - Ver próximo Ekadasi\n• STOP - Cancelar suscripción\n\nHare Krishna! 🙏`;
    } else if (isSubscribed) {
      responseText = `🙏 Hare Krishna!\n\nYa estás suscrito.\n\n*Comandos:*\n• PROXIMO - Ver próximo Ekadasi\n• STOP - Cancelar suscripción\n\nO escribe el nombre de tu ciudad para cambiar tu ubicación.`;
    } else {
      responseText = `🙏 Hare Krishna!\n\nSoy el bot de recordatorios de Ekadasi.\n\n*Escribe tu ciudad o selecciona:*\n\n1️⃣ Ciudad de México\n2️⃣ Guadalajara\n3️⃣ Monterrey\n4️⃣ India (Vṛndāvan)\n\nO escribe directamente: Lima, Bogotá, Madrid, etc.`;
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
