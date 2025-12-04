import type { Ekadasi } from "../db/schema.js";

/**
 * Genera un archivo iCal (.ics) a partir de los ekadasis
 * Compatible con Google Calendar, Apple Calendar, Outlook
 */
export function generateIcal(ekadasis: Ekadasi[], timezone: string): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  let ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Ekadasi Calendar//Pure Bhakti//ES
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Ekadasi Calendar (Pure Bhakti)
X-WR-TIMEZONE:${timezone}
`;

  for (const ekadasi of ekadasis) {
    const uid = `ekadasi-${ekadasi.id}@purebhakti.calendar`;
    const dateFormatted = ekadasi.date.replace(/-/g, "");
    const paranDateFormatted = ekadasi.paranDate?.replace(/-/g, "") || dateFormatted;

    // Evento principal: Día de Ekadasi (ayuno)
    ical += `
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${now}
DTSTART;VALUE=DATE:${dateFormatted}
DTEND;VALUE=DATE:${dateFormatted}
SUMMARY:🌙 ${ekadasi.name}${ekadasi.isDvadasi ? " (Dvādaśī)" : ""}
DESCRIPTION:Día de ayuno de Ekadasi.\\n\\nRomper el ayuno mañana entre ${ekadasi.paranStart} - ${ekadasi.paranEnd}${ekadasi.notes ? `\\n\\nNota: ${ekadasi.notes}` : ""}
CATEGORIES:Ekadasi,Ayuno
STATUS:CONFIRMED
END:VEVENT`;

    // Evento de paran (recordatorio para romper el ayuno)
    ical += `
BEGIN:VEVENT
UID:${uid}-paran
DTSTAMP:${now}
DTSTART:${paranDateFormatted}T${ekadasi.paranStart.replace(":", "")}00
DTEND:${paranDateFormatted}T${ekadasi.paranEnd.replace(":", "")}00
SUMMARY:🍽️ Paran - Romper ayuno de ${ekadasi.name}
DESCRIPTION:Ventana para romper el ayuno de ${ekadasi.name}.\\n\\nHorario: ${ekadasi.paranStart} - ${ekadasi.paranEnd}${ekadasi.isDvadasi ? "\\n\\nHoy es Dvādaśī - romper con granos." : ""}
CATEGORIES:Paran,Ekadasi
STATUS:CONFIRMED
BEGIN:VALARM
TRIGGER:-PT30M
ACTION:DISPLAY
DESCRIPTION:Paran en 30 minutos - Romper ayuno de ${ekadasi.name}
END:VALARM
END:VEVENT`;
  }

  ical += `
END:VCALENDAR`;

  return ical.trim();
}
