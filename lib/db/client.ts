import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | undefined;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL not set in .env.local");
    // Azure Database for PostgreSQL requires TLS. Enable it when the URL asks for
    // it (sslmode=require) or when DATABASE_SSL=true; local dev stays plaintext.
    const wantSsl =
      /sslmode=require/.test(connectionString) || process.env.DATABASE_SSL === "true";
    pool = new Pool({
      connectionString,
      ...(wantSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}
