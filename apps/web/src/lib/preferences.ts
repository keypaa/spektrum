// Preferences server helpers — one JSONB row per user, DB authoritative (D38).
// `getPreferences` is the read path and always returns a full valid object:
// a stored row is merged over the defaults field by field, so a schema change
// in the DB can never crash the app. `putPreferences` validates with the
// strict schema and upserts.

import { eq } from "drizzle-orm";
import { db } from "@spektrum/db";
import { userPreferences } from "@spektrum/db/schema";
import {
  mergePreferences,
  preferencesSchema,
  type Preferences,
} from "@spektrum/shared/preferences";

export async function getPreferences(userId: string): Promise<Preferences> {
  const [row] = await db
    .select({ settings: userPreferences.settings })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return mergePreferences(row?.settings);
}

export async function putPreferences(
  userId: string,
  value: Preferences,
): Promise<Preferences> {
  const parsed = preferencesSchema.parse(value);
  const [row] = await db
    .insert(userPreferences)
    .values({ userId, settings: parsed })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { settings: parsed },
    })
    .returning({ settings: userPreferences.settings });
  return mergePreferences(row?.settings);
}