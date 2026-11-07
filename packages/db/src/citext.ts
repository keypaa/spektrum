// citext column type for Drizzle (spec §4: emails are citext so case-insensitive
// uniqueness is enforced at the unique index, before any application check).
import { customType } from "drizzle-orm/pg-core";

export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});
