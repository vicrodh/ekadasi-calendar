import { chromium } from "playwright";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { ekadasis } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

// Zonas horarias a scrapear (agregar más según necesidad)
const TIMEZONES = [
  { name: "America/Mexico_City", offset: "-06:00 Mexico" },
  // Puedes agregar más:
  // { name: "America/Bogota", offset: "-05:00 Colombia, Peru" },
  // { name: "America/Buenos_Aires", offset: "-03:00 Argentina" },
];

interface EkadashiData {
  name: string;
  date: string;
  paranStart: string;
  paranEnd: string;
  paranDate: string;
  isDvadasi: boolean;
  notes?: string;
}

async function scrapeEkadasis(timezone: { name: string; offset: string }): Promise<EkadashiData[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`Scraping para timezone: ${timezone.name}`);

    await page.goto("https://www.purebhakti.com/resources/vaisnava-calendar", {
      waitUntil: "networkidle",
    });

    // Seleccionar timezone en el dropdown
    await page.selectOption('select[name="timezone"]', timezone.offset);

    // Esperar a que el calendario cargue
    await page.waitForTimeout(2000);

    // Extraer datos del calendario
    // NOTA: Esta estructura depende del HTML real del sitio
    // Puede requerir ajustes después de inspeccionar el DOM
    const ekadashiData = await page.evaluate(() => {
      const results: EkadashiData[] = [];

      // Buscar elementos que contengan "Ekādaśī" o "Ekadasi"
      const rows = document.querySelectorAll("tr, .calendar-row, .event");

      rows.forEach((row) => {
        const text = row.textContent || "";

        if (text.includes("Ekādaśī") || text.includes("Ekadasi")) {
          // Extraer información - ajustar selectores según estructura real
          const dateEl = row.querySelector(".date, td:first-child");
          const nameEl = row.querySelector(".event-name, td:nth-child(2)");
          const paranEl = row.querySelector(".paran, .break-fast");

          if (dateEl && nameEl) {
            // Parsear el horario de paran (ej: "Break fast 07:15 - 09:45")
            const paranMatch = (paranEl?.textContent || "").match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);

            results.push({
              name: nameEl.textContent?.trim() || "Ekādaśī",
              date: dateEl.textContent?.trim() || "",
              paranStart: paranMatch?.[1] || "07:00",
              paranEnd: paranMatch?.[2] || "10:00",
              paranDate: "", // Se calcula después
              isDvadasi: text.includes("Dvādaśī") || text.includes("Dvadasi"),
              notes: text.includes("(") ? text.match(/\(([^)]+)\)/)?.[1] : undefined,
            });
          }
        }
      });

      return results;
    });

    console.log(`Encontrados ${ekadashiData.length} ekadasis`);
    return ekadashiData;

  } catch (error) {
    console.error(`Error scraping ${timezone.name}:`, error);
    return [];
  } finally {
    await browser.close();
  }
}

async function main() {
  // Verificar variables de entorno
  if (!process.env.TURSO_DATABASE_URL) {
    console.error("TURSO_DATABASE_URL no configurada");
    process.exit(1);
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const db = drizzle(client);

  for (const tz of TIMEZONES) {
    const data = await scrapeEkadasis(tz);

    for (const ekadasi of data) {
      // Verificar si ya existe
      const existing = await db
        .select()
        .from(ekadasis)
        .where(
          and(
            eq(ekadasis.date, ekadasi.date),
            eq(ekadasis.timezone, tz.name)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(ekadasis).values({
          name: ekadasi.name,
          date: ekadasi.date,
          timezone: tz.name,
          paranStart: ekadasi.paranStart,
          paranEnd: ekadasi.paranEnd,
          paranDate: ekadasi.paranDate,
          isDvadasi: ekadasi.isDvadasi,
          notes: ekadasi.notes,
        });
        console.log(`Insertado: ${ekadasi.name} - ${ekadasi.date}`);
      }
    }
  }

  console.log("Scraping completado");
}

main().catch(console.error);
