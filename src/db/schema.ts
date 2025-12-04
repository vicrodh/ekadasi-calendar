import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Tabla de Ekadasis scrapeados
export const ekadasis = sqliteTable("ekadasis", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // "Utpannā Ekādaśī"
  date: text("date").notNull(), // "2024-12-26" (ISO format)
  timezone: text("timezone").notNull(), // "America/Mexico_City"
  fastingStarts: text("fasting_starts"), // Hora inicio ayuno
  paranStart: text("paran_start").notNull(), // "07:15"
  paranEnd: text("paran_end").notNull(), // "09:45"
  paranDate: text("paran_date").notNull(), // Fecha del paran (día siguiente)
  isDvadasi: integer("is_dvadasi", { mode: "boolean" }).default(false), // Si es Dvadasi en vez de Ekadasi
  notes: text("notes"), // Notas especiales (festividades, etc)
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

// Tabla de suscriptores de WhatsApp
export const subscribers = sqliteTable("subscribers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull().unique(), // "whatsapp:+525512345678"
  timezone: text("timezone").notNull().default("America/Mexico_City"),
  active: integer("active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  lastNotified: text("last_notified"), // Último ekadasi notificado
});

// Tabla de notificaciones enviadas (para evitar duplicados)
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subscriberId: integer("subscriber_id").references(() => subscribers.id),
  ekadaisiId: integer("ekadasi_id").references(() => ekadasis.id),
  type: text("type").notNull(), // "reminder" | "paran"
  sentAt: text("sent_at").default("CURRENT_TIMESTAMP"),
});

// Tipos exportados
export type Ekadasi = typeof ekadasis.$inferSelect;
export type NewEkadasi = typeof ekadasis.$inferInsert;
export type Subscriber = typeof subscribers.$inferSelect;
export type NewSubscriber = typeof subscribers.$inferInsert;
