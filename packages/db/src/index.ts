// @spektrum/db — Drizzle client + pool, both built from DATABASE_URL.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = postgres(databaseUrl, { max: 10 });
export const db = drizzle(pool, { schema });

export * as schema from "./schema";
