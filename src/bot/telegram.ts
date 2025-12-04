import { eq, and, gte } from "drizzle-orm";
import { telegramSubscribers, telegramNotifications, ekadasis } from "../db/schema.js";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

type Env = {
  TELEGRAM_BOT_TOKEN: string;
};

// Traducciones
const i18n = {
  es: {
    welcome: `🙏 *Hare Krishna!*

Soy el bot de recordatorios de Ekadasi.

*Escribe tu ciudad o selecciona:*

1️⃣ Ciudad de México
2️⃣ Guadalajara
3️⃣ Monterrey
4️⃣ India (Vṛndāvan)

O escribe directamente: Lima, Bogotá, Madrid, etc.

_Escribe /english para cambiar a inglés_`,
    subscribed: (city: string, country: string) => `✅ *¡Suscripción confirmada!*

📍 ${city}, ${country}

*Recibirás:*
• Recordatorio 1 día antes de Ekadasi
• Horario de paran (ruptura de ayuno)

*Comandos:*
/proximo - Ver próximo Ekadasi
/reglas - Ver reglas de ayuno
/stop - Cancelar suscripción

Hare Krishna! 🙏`,
    alreadySubscribed: `🙏 *Hare Krishna!*

Ya estás suscrito.

*Comandos:*
/proximo - Ver próximo Ekadasi
/reglas - Ver reglas de ayuno
/ciudad - Cambiar ubicación
/stop - Cancelar suscripción

O escribe el nombre de tu ciudad para cambiar tu ubicación.`,
    unsubscribed: `✅ Has cancelado tu suscripción. Ya no recibirás recordatorios.

Puedes volver a suscribirte en cualquier momento con /start`,
    notSubscribed: `No tienes una suscripción activa. Escribe /start para comenzar.`,
    nextEkadasi: (name: string, date: string, paranStart: string, paranEnd: string, notes?: string | null) =>
      `🌙 *Próximo Ekadasi*

📅 ${name}
🗓️ ${date}

🍽️ Paran: ${paranStart} - ${paranEnd}${notes ? `\n\n📝 ${notes}` : ""}`,
    noEkadasi: `No hay información de próximos ekadasis. Por favor intenta más tarde.`,
    languageChanged: `🌐 Idioma cambiado a *Español*`,
    cityPrompt: `📍 Escribe el nombre de tu ciudad para actualizar tu ubicación.`,
    cityNotFound: `❌ No encontré esa ciudad. Intenta con el nombre de una ciudad grande cercana o escribe el país.`,
    fastingRules: `📜 *Reglas de Ayuno - Ekādaśī*

*Alimentos RESTRINGIDOS en Ekādaśī:*
• Granos (arroz, trigo, maíz, avena, etc.)
• Leguminosas (frijoles, lentejas, garbanzos)
• Vegetales de hoja (espinaca, lechuga, col)
• Tomates, berenjenas, coliflor, brócoli
• Especias como hing, comino, mostaza, cúrcuma
• Miel y aceites de granos

*Alimentos PERMITIDOS:*
• Frutas frescas y nueces
• Papas, pepino, calabaza, aguacate
• Productos lácteos puros
• Azúcar, sal, pimienta negra
• Aceites de nueces (coco, etc.)

*Esencia del ayuno:*
Comer simple, una o dos veces, para dedicar tiempo a escuchar, cantar y recordar a Śrī Śrī Rādhā-Kṛṣṇa.

_Más detalles en: ekadasi.bhaktilatam.com_`,
  },
  en: {
    welcome: `🙏 *Hare Krishna!*

I'm the Ekadasi reminder bot.

*Type your city or select:*

1️⃣ Mexico City
2️⃣ Guadalajara
3️⃣ Monterrey
4️⃣ India (Vṛndāvan)

Or type directly: Lima, Bogotá, Madrid, etc.

_Type /spanish to switch to Spanish_`,
    subscribed: (city: string, country: string) => `✅ *Subscription confirmed!*

📍 ${city}, ${country}

*You'll receive:*
• Reminder 1 day before Ekadasi
• Paran time (fast breaking)

*Commands:*
/next - See next Ekadasi
/rules - View fasting rules
/stop - Unsubscribe

Hare Krishna! 🙏`,
    alreadySubscribed: `🙏 *Hare Krishna!*

You're already subscribed.

*Commands:*
/next - See next Ekadasi
/rules - View fasting rules
/city - Change location
/stop - Unsubscribe

Or type your city name to change your location.`,
    unsubscribed: `✅ You've unsubscribed. You won't receive any more reminders.

You can subscribe again anytime with /start`,
    notSubscribed: `You don't have an active subscription. Type /start to begin.`,
    nextEkadasi: (name: string, date: string, paranStart: string, paranEnd: string, notes?: string | null) =>
      `🌙 *Next Ekadasi*

📅 ${name}
🗓️ ${date}

🍽️ Paran: ${paranStart} - ${paranEnd}${notes ? `\n\n📝 ${notes}` : ""}`,
    noEkadasi: `No upcoming ekadasi information available. Please try again later.`,
    languageChanged: `🌐 Language changed to *English*`,
    cityPrompt: `📍 Type your city name to update your location.`,
    cityNotFound: `❌ City not found. Try a nearby major city or type the country name.`,
    fastingRules: `📜 *Fasting Rules - Ekādaśī*

*RESTRICTED foods on Ekādaśī:*
• Grains (rice, wheat, corn, oats, etc.)
• Legumes (beans, lentils, chickpeas)
• Leafy vegetables (spinach, lettuce, cabbage)
• Tomatoes, eggplant, cauliflower, broccoli
• Spices like hing, cumin, mustard, turmeric
• Honey and grain oils

*ALLOWED foods:*
• Fresh fruits and nuts
• Potatoes, cucumber, squash, avocado
• Pure dairy products
• Sugar, salt, black pepper
• Nut oils (coconut, etc.)

*Essence of fasting:*
Eat simply, once or twice, to dedicate time to hearing, chanting and remembering Śrī Śrī Rādhā-Kṛṣṇa.

_More details at: ekadasi.bhaktilatam.com_`,
  },
};

// Base de datos de ciudades (reutilizada de whatsapp.ts)
const CITIES_DB: Array<{
  tz: string;
  label: string;
  labelEn: string;
  aliases: string[];
  country: string;
  countryEn: string;
}> = [
  // México
  { tz: "America/Mexico_City", label: "Ciudad de México", labelEn: "Mexico City", aliases: ["cdmx", "df", "mexico city", "ciudad de mexico", "mexico df", "distrito federal"], country: "México", countryEn: "Mexico" },
  { tz: "America/Mexico_City", label: "Guadalajara", labelEn: "Guadalajara", aliases: ["guadalajara", "gdl", "jalisco"], country: "México", countryEn: "Mexico" },
  { tz: "America/Monterrey", label: "Monterrey", labelEn: "Monterrey", aliases: ["monterrey", "mty", "nuevo leon"], country: "México", countryEn: "Mexico" },
  { tz: "America/Mexico_City", label: "Puebla", labelEn: "Puebla", aliases: ["puebla"], country: "México", countryEn: "Mexico" },
  { tz: "America/Tijuana", label: "Tijuana", labelEn: "Tijuana", aliases: ["tijuana", "tj", "baja california"], country: "México", countryEn: "Mexico" },
  { tz: "America/Mexico_City", label: "León", labelEn: "León", aliases: ["leon", "guanajuato"], country: "México", countryEn: "Mexico" },
  { tz: "America/Mexico_City", label: "Zacatecas", labelEn: "Zacatecas", aliases: ["zacatecas"], country: "México", countryEn: "Mexico" },
  { tz: "America/Mexico_City", label: "Ciudad Victoria", labelEn: "Ciudad Victoria", aliases: ["ciudad victoria", "victoria", "tamaulipas"], country: "México", countryEn: "Mexico" },
  { tz: "America/Mexico_City", label: "Querétaro", labelEn: "Querétaro", aliases: ["queretaro", "qro"], country: "México", countryEn: "Mexico" },
  { tz: "America/Mexico_City", label: "Mérida", labelEn: "Mérida", aliases: ["merida", "yucatan"], country: "México", countryEn: "Mexico" },
  { tz: "America/Cancun", label: "Cancún", labelEn: "Cancún", aliases: ["cancun", "quintana roo", "playa del carmen"], country: "México", countryEn: "Mexico" },
  { tz: "America/Mexico_City", label: "Morelia", labelEn: "Morelia", aliases: ["morelia", "michoacan"], country: "México", countryEn: "Mexico" },
  { tz: "America/Mexico_City", label: "Oaxaca", labelEn: "Oaxaca", aliases: ["oaxaca"], country: "México", countryEn: "Mexico" },
  { tz: "America/Mexico_City", label: "Veracruz", labelEn: "Veracruz", aliases: ["veracruz"], country: "México", countryEn: "Mexico" },
  { tz: "America/Hermosillo", label: "Hermosillo", labelEn: "Hermosillo", aliases: ["hermosillo", "sonora"], country: "México", countryEn: "Mexico" },
  { tz: "America/Chihuahua", label: "Chihuahua", labelEn: "Chihuahua", aliases: ["chihuahua"], country: "México", countryEn: "Mexico" },
  { tz: "America/Mazatlan", label: "Mazatlán", labelEn: "Mazatlán", aliases: ["mazatlan", "sinaloa", "culiacan"], country: "México", countryEn: "Mexico" },

  // Sudamérica
  { tz: "America/Lima", label: "Lima", labelEn: "Lima", aliases: ["lima", "peru", "perú"], country: "Perú", countryEn: "Peru" },
  { tz: "America/Bogota", label: "Bogotá", labelEn: "Bogotá", aliases: ["bogota", "colombia", "medellin", "cali"], country: "Colombia", countryEn: "Colombia" },
  { tz: "America/Santiago", label: "Santiago", labelEn: "Santiago", aliases: ["santiago", "chile"], country: "Chile", countryEn: "Chile" },
  { tz: "America/Argentina/Buenos_Aires", label: "Buenos Aires", labelEn: "Buenos Aires", aliases: ["buenos aires", "argentina", "bsas"], country: "Argentina", countryEn: "Argentina" },
  { tz: "America/Sao_Paulo", label: "São Paulo", labelEn: "São Paulo", aliases: ["sao paulo", "brasil", "brazil", "rio de janeiro", "rio"], country: "Brasil", countryEn: "Brazil" },
  { tz: "America/Caracas", label: "Caracas", labelEn: "Caracas", aliases: ["caracas", "venezuela"], country: "Venezuela", countryEn: "Venezuela" },
  { tz: "America/Guayaquil", label: "Ecuador", labelEn: "Ecuador", aliases: ["quito", "guayaquil", "ecuador"], country: "Ecuador", countryEn: "Ecuador" },
  { tz: "America/La_Paz", label: "Bolivia", labelEn: "Bolivia", aliases: ["la paz", "bolivia", "santa cruz"], country: "Bolivia", countryEn: "Bolivia" },
  { tz: "America/Asuncion", label: "Paraguay", labelEn: "Paraguay", aliases: ["asuncion", "paraguay"], country: "Paraguay", countryEn: "Paraguay" },
  { tz: "America/Montevideo", label: "Uruguay", labelEn: "Uruguay", aliases: ["montevideo", "uruguay"], country: "Uruguay", countryEn: "Uruguay" },

  // Centroamérica y Caribe
  { tz: "America/Guatemala", label: "Guatemala", labelEn: "Guatemala", aliases: ["guatemala"], country: "Guatemala", countryEn: "Guatemala" },
  { tz: "America/Costa_Rica", label: "Costa Rica", labelEn: "Costa Rica", aliases: ["costa rica", "san jose"], country: "Costa Rica", countryEn: "Costa Rica" },
  { tz: "America/Panama", label: "Panamá", labelEn: "Panama", aliases: ["panama"], country: "Panamá", countryEn: "Panama" },
  { tz: "America/Havana", label: "Cuba", labelEn: "Cuba", aliases: ["habana", "cuba", "la habana"], country: "Cuba", countryEn: "Cuba" },
  { tz: "America/Santo_Domingo", label: "Rep. Dominicana", labelEn: "Dominican Rep.", aliases: ["santo domingo", "dominicana", "republica dominicana"], country: "Rep. Dominicana", countryEn: "Dominican Rep." },
  { tz: "America/Puerto_Rico", label: "Puerto Rico", labelEn: "Puerto Rico", aliases: ["puerto rico", "san juan"], country: "Puerto Rico", countryEn: "Puerto Rico" },
  { tz: "America/El_Salvador", label: "El Salvador", labelEn: "El Salvador", aliases: ["el salvador", "salvador"], country: "El Salvador", countryEn: "El Salvador" },
  { tz: "America/Tegucigalpa", label: "Honduras", labelEn: "Honduras", aliases: ["honduras", "tegucigalpa"], country: "Honduras", countryEn: "Honduras" },
  { tz: "America/Managua", label: "Nicaragua", labelEn: "Nicaragua", aliases: ["nicaragua", "managua"], country: "Nicaragua", countryEn: "Nicaragua" },

  // Estados Unidos
  { tz: "America/Los_Angeles", label: "Los Ángeles", labelEn: "Los Angeles", aliases: ["los angeles", "la", "california", "san francisco", "san diego"], country: "USA", countryEn: "USA" },
  { tz: "America/Chicago", label: "Chicago", labelEn: "Chicago", aliases: ["chicago", "houston", "dallas", "texas", "austin"], country: "USA", countryEn: "USA" },
  { tz: "America/New_York", label: "Nueva York", labelEn: "New York", aliases: ["new york", "nueva york", "nyc", "miami", "florida", "boston", "washington"], country: "USA", countryEn: "USA" },
  { tz: "America/Denver", label: "Denver", labelEn: "Denver", aliases: ["denver", "colorado", "phoenix", "arizona"], country: "USA", countryEn: "USA" },

  // Europa
  { tz: "Europe/Madrid", label: "España", labelEn: "Spain", aliases: ["madrid", "españa", "spain", "barcelona", "valencia", "sevilla"], country: "España", countryEn: "Spain" },
  { tz: "Europe/London", label: "Reino Unido", labelEn: "United Kingdom", aliases: ["london", "londres", "uk", "reino unido", "england", "manchester"], country: "UK", countryEn: "UK" },
  { tz: "Europe/Paris", label: "Francia", labelEn: "France", aliases: ["paris", "francia", "france"], country: "Francia", countryEn: "France" },
  { tz: "Europe/Berlin", label: "Alemania", labelEn: "Germany", aliases: ["berlin", "alemania", "germany", "munich"], country: "Alemania", countryEn: "Germany" },
  { tz: "Europe/Rome", label: "Italia", labelEn: "Italy", aliases: ["roma", "italia", "italy", "milan"], country: "Italia", countryEn: "Italy" },
  { tz: "Europe/Amsterdam", label: "Países Bajos", labelEn: "Netherlands", aliases: ["amsterdam", "holanda", "netherlands", "paises bajos"], country: "Países Bajos", countryEn: "Netherlands" },
  { tz: "Europe/Lisbon", label: "Portugal", labelEn: "Portugal", aliases: ["lisboa", "portugal", "lisbon"], country: "Portugal", countryEn: "Portugal" },

  // Asia
  { tz: "Asia/Kolkata", label: "India (Vṛndāvan)", labelEn: "India (Vṛndāvan)", aliases: ["india", "vrindavan", "vrindavana", "mathura", "delhi", "mumbai", "kolkata", "mayapur", "navadvipa"], country: "India", countryEn: "India" },
  { tz: "Asia/Tokyo", label: "Japón", labelEn: "Japan", aliases: ["tokyo", "japon", "japan"], country: "Japón", countryEn: "Japan" },
  { tz: "Asia/Shanghai", label: "China", labelEn: "China", aliases: ["china", "beijing", "shanghai"], country: "China", countryEn: "China" },
  { tz: "Asia/Singapore", label: "Singapur", labelEn: "Singapore", aliases: ["singapore", "singapur"], country: "Singapur", countryEn: "Singapore" },
  { tz: "Asia/Dubai", label: "Emiratos Árabes", labelEn: "UAE", aliases: ["dubai", "uae", "emiratos"], country: "EAU", countryEn: "UAE" },

  // Oceanía
  { tz: "Australia/Sydney", label: "Australia", labelEn: "Australia", aliases: ["australia", "sydney", "melbourne"], country: "Australia", countryEn: "Australia" },
  { tz: "Pacific/Auckland", label: "Nueva Zelanda", labelEn: "New Zealand", aliases: ["nueva zelanda", "new zealand", "auckland"], country: "Nueva Zelanda", countryEn: "New Zealand" },

  // África
  { tz: "Africa/Johannesburg", label: "Sudáfrica", labelEn: "South Africa", aliases: ["sudafrica", "south africa", "johannesburg", "cape town"], country: "Sudáfrica", countryEn: "South Africa" },
];

// Opciones numéricas rápidas
const QUICK_OPTIONS: Record<string, { tz: string; label: string; labelEn: string }> = {
  "1": { tz: "America/Mexico_City", label: "Ciudad de México", labelEn: "Mexico City" },
  "2": { tz: "America/Mexico_City", label: "Guadalajara", labelEn: "Guadalajara" },
  "3": { tz: "America/Monterrey", label: "Monterrey", labelEn: "Monterrey" },
  "4": { tz: "Asia/Kolkata", label: "India (Vṛndāvan)", labelEn: "India (Vṛndāvan)" },
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function findCity(input: string) {
  const normalized = normalizeText(input);
  if (!normalized || normalized.length < 2) return null;

  for (const city of CITIES_DB) {
    if (normalizeText(city.label) === normalized || normalizeText(city.labelEn) === normalized) {
      return city;
    }
    for (const alias of city.aliases) {
      if (normalizeText(alias) === normalized) {
        return city;
      }
    }
  }

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

// Telegram API helper
async function sendTelegramMessage(chatId: string, text: string, env: Env): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

interface TelegramUpdate {
  message?: {
    chat: {
      id: number;
    };
    from?: {
      username?: string;
      first_name?: string;
      language_code?: string;
    };
    text?: string;
  };
}

/**
 * Maneja mensajes entrantes de Telegram
 */
export async function handleTelegramWebhook(
  update: TelegramUpdate,
  db: LibSQLDatabase,
  env: Env
): Promise<void> {
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id.toString();
  const text = message.text.trim();
  const username = message.from?.username;
  const firstName = message.from?.first_name;

  // Buscar suscriptor existente
  const existingSubscriber = await db
    .select()
    .from(telegramSubscribers)
    .where(eq(telegramSubscribers.chatId, chatId))
    .limit(1);

  const subscriber = existingSubscriber[0];
  const isSubscribed = subscriber && subscriber.active;
  const lang = (subscriber?.language || "es") as "es" | "en";
  const t = i18n[lang];

  // Idioma default es español
  const userLang = "es";

  // Comandos
  const command = text.toLowerCase();

  // /start
  if (command === "/start") {
    const initialLang = subscriber?.language || userLang;
    await sendTelegramMessage(chatId, i18n[initialLang as "es" | "en"].welcome, env);
    return;
  }

  // /stop
  if (command === "/stop" || command === "/salir" || command === "/cancelar") {
    if (isSubscribed) {
      await db
        .update(telegramSubscribers)
        .set({ active: false })
        .where(eq(telegramSubscribers.chatId, chatId));
      await sendTelegramMessage(chatId, t.unsubscribed, env);
    } else {
      await sendTelegramMessage(chatId, t.notSubscribed, env);
    }
    return;
  }

  // /proximo or /next
  if (command === "/proximo" || command === "/próximo" || command === "/next") {
    const tz = subscriber?.timezone || "America/Mexico_City";
    const today = new Date().toISOString().split("T")[0];

    const next = await db
      .select()
      .from(ekadasis)
      .where(and(eq(ekadasis.timezone, tz), gte(ekadasis.date, today)))
      .orderBy(ekadasis.date)
      .limit(1);

    if (next.length > 0) {
      const e = next[0];
      await sendTelegramMessage(
        chatId,
        t.nextEkadasi(e.name, e.date, e.paranStart, e.paranEnd, e.notes),
        env
      );
    } else {
      await sendTelegramMessage(chatId, t.noEkadasi, env);
    }
    return;
  }

  // /english
  if (command === "/english" || command === "/ingles" || command === "/inglés") {
    if (subscriber) {
      await db
        .update(telegramSubscribers)
        .set({ language: "en" })
        .where(eq(telegramSubscribers.chatId, chatId));
    }
    await sendTelegramMessage(chatId, i18n.en.languageChanged, env);
    return;
  }

  // /spanish
  if (command === "/spanish" || command === "/español" || command === "/espanol") {
    if (subscriber) {
      await db
        .update(telegramSubscribers)
        .set({ language: "es" })
        .where(eq(telegramSubscribers.chatId, chatId));
    }
    await sendTelegramMessage(chatId, i18n.es.languageChanged, env);
    return;
  }

  // /ciudad or /city
  if (command === "/ciudad" || command === "/city") {
    await sendTelegramMessage(chatId, t.cityPrompt, env);
    return;
  }

  // /reglas or /rules
  if (command === "/reglas" || command === "/rules" || command === "/fasting") {
    await sendTelegramMessage(chatId, t.fastingRules, env);
    return;
  }

  // Selección rápida por número
  if (QUICK_OPTIONS[text]) {
    const selected = QUICK_OPTIONS[text];
    const cityLabel = lang === "en" ? selected.labelEn : selected.label;
    const country = lang === "en" ? "Mexico" : "México";

    if (isSubscribed) {
      await db
        .update(telegramSubscribers)
        .set({ timezone: selected.tz })
        .where(eq(telegramSubscribers.chatId, chatId));
    } else {
      await db.insert(telegramSubscribers).values({
        chatId,
        username,
        firstName,
        timezone: selected.tz,
        language: userLang,
        active: true,
      });
    }

    await sendTelegramMessage(chatId, t.subscribed(cityLabel, country), env);
    return;
  }

  // Búsqueda de ciudad
  const foundCity = findCity(text);
  if (foundCity) {
    const cityLabel = lang === "en" ? foundCity.labelEn : foundCity.label;
    const country = lang === "en" ? foundCity.countryEn : foundCity.country;

    if (isSubscribed) {
      await db
        .update(telegramSubscribers)
        .set({ timezone: foundCity.tz })
        .where(eq(telegramSubscribers.chatId, chatId));
    } else {
      await db.insert(telegramSubscribers).values({
        chatId,
        username,
        firstName,
        timezone: foundCity.tz,
        language: userLang,
        active: true,
      });
    }

    await sendTelegramMessage(chatId, t.subscribed(cityLabel, country), env);
    return;
  }

  // Mensaje no reconocido
  if (isSubscribed) {
    await sendTelegramMessage(chatId, t.alreadySubscribed, env);
  } else {
    await sendTelegramMessage(chatId, i18n[userLang as "es" | "en"].welcome, env);
  }
}

/**
 * Envía notificaciones de Telegram a todos los suscriptores
 */
export async function sendTelegramNotifications(
  db: LibSQLDatabase,
  env: Env
): Promise<{ sent: number; errors: number }> {
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const activeSubscribers = await db
    .select()
    .from(telegramSubscribers)
    .where(eq(telegramSubscribers.active, true));

  let sent = 0;
  let errors = 0;

  for (const subscriber of activeSubscribers) {
    const lang = (subscriber.language || "es") as "es" | "en";
    const t = i18n[lang];

    // Buscar ekadasi de mañana para enviar recordatorio
    const tomorrowEkadasi = await db
      .select()
      .from(ekadasis)
      .where(and(eq(ekadasis.timezone, subscriber.timezone), eq(ekadasis.date, tomorrow)))
      .limit(1);

    if (tomorrowEkadasi.length > 0) {
      const e = tomorrowEkadasi[0];

      const alreadySent = await db
        .select()
        .from(telegramNotifications)
        .where(
          and(
            eq(telegramNotifications.subscriberId, subscriber.id),
            eq(telegramNotifications.ekadaisiId, e.id),
            eq(telegramNotifications.type, "reminder")
          )
        )
        .limit(1);

      if (alreadySent.length === 0) {
        try {
          const message = lang === "es"
            ? `🌙 *Mañana es ${e.name}*\n\n📅 ${formatDateEs(e.date)}\n\n🍽️ Paran: ${e.paranStart} - ${e.paranEnd}${e.notes ? `\n\n📝 ${e.notes}` : ""}\n\n_Hare Krishna! 🙏_`
            : `🌙 *Tomorrow is ${e.name}*\n\n📅 ${formatDateEn(e.date)}\n\n🍽️ Paran: ${e.paranStart} - ${e.paranEnd}${e.notes ? `\n\n📝 ${e.notes}` : ""}\n\n_Hare Krishna! 🙏_`;

          await sendTelegramMessage(subscriber.chatId, message, env);

          await db.insert(telegramNotifications).values({
            subscriberId: subscriber.id,
            ekadaisiId: e.id,
            type: "reminder",
          });

          sent++;
        } catch (error) {
          console.error(`Error sending Telegram reminder to ${subscriber.chatId}:`, error);
          errors++;
        }
      }
    }

    // Buscar si hoy es día de paran
    const todayParan = await db
      .select()
      .from(ekadasis)
      .where(and(eq(ekadasis.timezone, subscriber.timezone), eq(ekadasis.paranDate, today)))
      .limit(1);

    if (todayParan.length > 0) {
      const e = todayParan[0];

      const alreadySent = await db
        .select()
        .from(telegramNotifications)
        .where(
          and(
            eq(telegramNotifications.subscriberId, subscriber.id),
            eq(telegramNotifications.ekadaisiId, e.id),
            eq(telegramNotifications.type, "paran")
          )
        )
        .limit(1);

      if (alreadySent.length === 0) {
        try {
          const message = lang === "es"
            ? `🍽️ *Paran - Ruptura de ayuno*\n\n⏰ Hoy entre ${e.paranStart} y ${e.paranEnd}\n\n_¡Buen provecho! Hare Krishna 🙏_`
            : `🍽️ *Paran - Break your fast*\n\n⏰ Today between ${e.paranStart} and ${e.paranEnd}\n\n_Enjoy! Hare Krishna 🙏_`;

          await sendTelegramMessage(subscriber.chatId, message, env);

          await db.insert(telegramNotifications).values({
            subscriberId: subscriber.id,
            ekadaisiId: e.id,
            type: "paran",
          });

          sent++;
        } catch (error) {
          console.error(`Error sending Telegram paran to ${subscriber.chatId}:`, error);
          errors++;
        }
      }
    }
  }

  return { sent, errors };
}

function formatDateEs(dateISO: string): string {
  const [year, month, day] = dateISO.split("-");
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${parseInt(day)} de ${months[parseInt(month) - 1]}`;
}

function formatDateEn(dateISO: string): string {
  const [year, month, day] = dateISO.split("-");
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${months[parseInt(month) - 1]} ${parseInt(day)}`;
}
