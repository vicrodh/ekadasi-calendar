import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

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

  console.log("Ejecutando migraciones...");

  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log("Migraciones completadas");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error en migración:", err);
  process.exit(1);
});
