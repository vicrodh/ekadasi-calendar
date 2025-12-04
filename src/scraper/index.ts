import { chromium } from "playwright";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { ekadasis } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

// Ubicaciones a scrapear
const LOCATIONS = [
  {
    name: "America/Mexico_City",
    timezone: "-06_00",
    location: "Mexico City, Mexico           19N26 099W08  -6:00",
  },
  // Otras ciudades de México disponibles:
  // { name: "Guadalajara", timezone: "-06_00", location: "Guadalajara, Mexico           20N40 103W20  -6:00" },
  // { name: "Monterrey", timezone: "-06_00", location: "Monterrey, Mexico             25N40 100W19  -6:00" },
];

interface ScrapedDay {
  date: string;
  dateISO: string;
  tithi: string;
  events: string[];
  isFastingDay: boolean;
  fastingName: string | null;
  isNotSuitableForFasting: boolean;
  breakFastStart: string | null;
  breakFastEnd: string | null;
  isDvadasi: boolean;
}

interface EkadashiEvent {
  name: string;
  fastingDate: string;
  paranDate: string;
  paranStart: string;
  paranEnd: string;
  isDvadasi: boolean;
  notes: string | null;
}

function parseDate(dateStr: string): string {
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const parts = dateStr.trim().split(" ");
  const day = parts[0].padStart(2, "0");
  const month = months[parts[1]];
  const year = parts[2];
  return `${year}-${month}-${day}`;
}

function extractFastingName(events: string[]): string | null {
  for (const event of events) {
    const match = event.match(/FASTING FOR (.+?) EKĀDAŚĪ/i);
    if (match) return `${match[1]} Ekādaśī`;

    if (event.includes("Fast till noon")) {
      const nameMatch = event.match(/(.+?) ~.+Fast till noon/);
      if (nameMatch) return nameMatch[1].trim();
    }
  }
  return null;
}

function extractBreakFast(events: string[]): { start: string; end: string } | null {
  for (const event of events) {
    const match = event.match(/Break fast (\d{2}:\d{2}) - (\d{2}:\d{2})/);
    if (match) {
      return { start: match[1], end: match[2] };
    }
  }
  return null;
}

async function scrapePureBhakti(loc: typeof LOCATIONS[0]): Promise<ScrapedDay[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`Scraping para: ${loc.name}`);

    await page.goto("https://www.purebhakti.com/resources/vaisnava-calendar", {
      waitUntil: "networkidle",
    });

    // Paso 1: Seleccionar timezone
    await page.selectOption('select[name="timezone"]', loc.timezone);
    await page.click('input[value="Submit Time Zone"]');
    await page.waitForLoadState("networkidle");

    // Paso 2: Seleccionar ubicación
    await page.selectOption('select[name="location"]', loc.location);
    await page.click('input[value="Get Calendar"]');
    await page.waitForLoadState("networkidle");

    // Extraer todas las filas del calendario
    const days = await page.evaluate(() => {
      const rows = document.querySelectorAll("table tr");
      const results: Array<{
        date: string;
        tithi: string;
        events: string[];
      }> = [];

      rows.forEach((row) => {
        const dateCell = row.querySelector("td.date");
        const contentCell = row.querySelector("td:nth-child(2)");

        if (dateCell && contentCell) {
          const dateText = dateCell.querySelector("b")?.textContent?.trim() || "";
          const tithiEl = contentCell.querySelector("p.tithi b");
          const tithi = tithiEl?.textContent?.trim() || "";

          const events: string[] = [];
          contentCell.querySelectorAll("p.event").forEach((p) => {
            events.push(p.textContent?.trim() || "");
          });

          if (dateText) {
            results.push({ date: dateText, tithi, events });
          }
        }
      });

      return results;
    });

    const processedDays: ScrapedDay[] = days.map((day) => {
      const isFastingDay = day.events.some(
        (e) => e.includes("FASTING FOR") || e.includes("Fast till noon")
      );
      const isNotSuitableForFasting = day.events.some((e) =>
        e.includes("not suitable for fasting")
      );
      const breakFast = extractBreakFast(day.events);
      const isDvadasi = day.tithi.includes("Dvādaśī") && isFastingDay;

      return {
        date: day.date,
        dateISO: parseDate(day.date),
        tithi: day.tithi,
        events: day.events,
        isFastingDay,
        fastingName: extractFastingName(day.events),
        isNotSuitableForFasting,
        breakFastStart: breakFast?.start || null,
        breakFastEnd: breakFast?.end || null,
        isDvadasi,
      };
    });

    console.log(`Encontrados ${processedDays.length} días`);
    return processedDays;
  } catch (error) {
    console.error(`Error scraping ${loc.name}:`, error);
    return [];
  } finally {
    await browser.close();
  }
}

function processEkadashiEvents(days: ScrapedDay[]): EkadashiEvent[] {
  const events: EkadashiEvent[] = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];

    if (day.isFastingDay && day.fastingName) {
      let paranDay: ScrapedDay | null = null;
      for (let j = i + 1; j < Math.min(i + 5, days.length); j++) {
        if (days[j].breakFastStart) {
          paranDay = days[j];
          break;
        }
      }

      if (paranDay) {
        let notes: string | null = null;

        if (i > 0 && days[i - 1].isNotSuitableForFasting) {
          notes = "Ekādaśī recorrido por calendario lunar";
        }

        if (day.isDvadasi) {
          notes = (notes ? notes + ". " : "") + "Mahādvādaśī - ayuno en Dvādaśī";
        }

        events.push({
          name: day.fastingName,
          fastingDate: day.dateISO,
          paranDate: paranDay.dateISO,
          paranStart: paranDay.breakFastStart!,
          paranEnd: paranDay.breakFastEnd!,
          isDvadasi: day.isDvadasi,
          notes,
        });
      }
    }

    if (day.tithi === "Ekādaśī" && day.isNotSuitableForFasting) {
      console.log(`Nota: Ekādaśī del ${day.dateISO} se recorre al día siguiente`);
    }
  }

  return events;
}

async function main() {
  if (!process.env.TURSO_DATABASE_URL) {
    console.error("TURSO_DATABASE_URL no configurada");
    process.exit(1);
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const db = drizzle(client);

  for (const loc of LOCATIONS) {
    const days = await scrapePureBhakti(loc);
    const ekadashiEvents = processEkadashiEvents(days);

    console.log(`Procesados ${ekadashiEvents.length} ekadasis para ${loc.name}`);

    for (const event of ekadashiEvents) {
      const existing = await db
        .select()
        .from(ekadasis)
        .where(
          and(
            eq(ekadasis.date, event.fastingDate),
            eq(ekadasis.timezone, loc.name)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(ekadasis).values({
          name: event.name,
          date: event.fastingDate,
          timezone: loc.name,
          paranStart: event.paranStart,
          paranEnd: event.paranEnd,
          paranDate: event.paranDate,
          isDvadasi: event.isDvadasi,
          notes: event.notes,
        });
        console.log(`✓ Insertado: ${event.name} - ${event.fastingDate}`);
      } else {
        console.log(`- Ya existe: ${event.name} - ${event.fastingDate}`);
      }
    }
  }

  console.log("\n✅ Scraping completado");
}

main().catch(console.error);
