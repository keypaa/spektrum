// @spektrum/db — Drizzle client + pool, built lazily from DATABASE_URL.
// Lazy on purpose: Next.js imports route modules during `next build` to collect
// page data, and those modules import this one. Throwing at import time would
// break the build on a fresh clone with no env; the throw happens on first use
// (first query), which is where it belongs.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Pool = ReturnType<typeof postgres>;
type Db = ReturnType<typeof drizzle>;

let _pool: Pool | undefined;
let _db: Db | undefined;

function init(): { pool: Pool; db: Db } {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  _pool ??= postgres(databaseUrl, { max: 10 });
  _db ??= drizzle(_pool, { schema });
  return { pool: _pool, db: _db };
}

export const pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    return Reflect.get(init().pool, prop, receiver);
  },
  apply(_target, thisArg, args) {
    return Reflect.apply(init().pool, thisArg, args);
  },
});

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(init().db, prop, receiver);
  },
});

export * as schema from "./schema";
