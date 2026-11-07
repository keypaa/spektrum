// Common-password deny-list (spec §10.4: top 10k checked offline).
// Seed list for Task 6; replaced by the full 10k list in Task 17.
// Stored lowercase; validatePassword lowercases before lookup.
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "password",
  "passwordpassword",
  "123456789012",
  "qwertyuiop[]",
  "letmeinletmein",
  "iloveyouilove",
  "dragonball123",
  "footballfootball",
  "monkeybusiness1",
  "trustno1trustno",
]);
