// @spektrum/shared — fail-fast environment validation (zod 4).
// Every required variable is validated in one pass and a single aggregated
// error is thrown listing every problem, so a misconfigured deployment fails
// loudly at startup instead of halfway through a request.

import { z } from "zod";

// Only the literal string "true" means true. z.coerce.boolean() would also
// accept "1", "yes", etc., which is not what we want for a signup gate.
// z.unknown().transform() maps undefined (unset) to false; preprocess would
// forward undefined into z.boolean() and fail before .default() runs.
const envBoolean = z.unknown().transform((v) => v === "true").pipe(z.boolean());

const envString = (name: string) =>
  z.string().min(1, `${name} must be a non-empty string`);

const envSecret = (name: string, min: number) =>
  z.string().min(min, `${name} must be at least ${min} characters`);

// Schema keys are the raw environment variable names so that zod's error paths
// read as DATABASE_URL, BETTER_AUTH_SECRET, etc. — what an operator greps for.
const envVarSchema = z.object({
  DATABASE_URL: envString("DATABASE_URL"),
  // Either REDIS_URL (TCP, VPS/dev) or BOTH Upstash REST variables (serverless
  // Vercel functions) must be set. The cross-field check lives in loadWebEnv
  // so it can be reported together with every other problem in one pass.
  REDIS_URL: envString("REDIS_URL").optional(),
  UPSTASH_REDIS_REST_URL: envString("UPSTASH_REDIS_REST_URL").optional(),
  UPSTASH_REDIS_REST_TOKEN: envString("UPSTASH_REDIS_REST_TOKEN").optional(),
  BETTER_AUTH_SECRET: envSecret("BETTER_AUTH_SECRET", 32),
  BETTER_AUTH_URL: z.string().url("BETTER_AUTH_URL must be a URL"),
  LLM_KEY_ENCRYPTION_SECRET: envSecret("LLM_KEY_ENCRYPTION_SECRET", 32),
  LLM_BASE_URL: z.string().url().default("https://api.kilo.ai/api/gateway"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL_CHAT: z.string().default("openai/gpt-4o"),
  LLM_MODEL_FAST: z.string().default("openai/gpt-4o-mini"),
  ALLOW_PUBLIC_SIGNUP: envBoolean.optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  // S3/R2 settings mirror the defaults in @spektrum/storage so validation and
  // presigning agree on endpoint, buckets, credentials and region. An empty
  // value is filtered out below and therefore falls back to the same default.
  S3_ENDPOINT: envString("S3_ENDPOINT").default("http://localhost:9000"),
  S3_BUCKET: envString("S3_BUCKET").default("spektrum-uploads"),
  S3_PDF_BUCKET: envString("S3_PDF_BUCKET").default("spektrum-pdf"),
  S3_ACCESS_KEY: envString("S3_ACCESS_KEY").default("spektrum"),
  S3_SECRET_KEY: envString("S3_SECRET_KEY").default("spektrum-secret"),
  S3_REGION: envString("S3_REGION").default("auto"),
  // Prism import caps (spec §13.2.4). Positive integers only: a bad value must
  // fail at startup, not on the first upload.
  IMPORT_MAX_FILE_BYTES: z.coerce.number().int().positive().default(26_214_400),
  IMPORT_MAX_TOTAL_BYTES: z.coerce.number().int().positive().default(536_870_912),
  IMPORT_MAX_ENTRIES: z.coerce.number().int().positive().default(50_000),
  IMPORT_MAX_RATIO: z.coerce.number().int().positive().default(100),
  IMPORT_MAX_PROJECTS: z.coerce.number().int().positive().default(200),
  // Optional error reporting and the metrics bearer token.
  SENTRY_DSN: z.string().url().optional(),
  METRICS_TOKEN: z.string().min(1).optional(),
  NODE_ENV: z.string().default("development"),
});

export type EnvVars = z.infer<typeof envVarSchema>;

// The camelCase shape consumers actually read. `authUrl` is `BETTER_AUTH_URL`,
// `authSecret` is `BETTER_AUTH_SECRET`, etc.
export interface WebEnv {
  databaseUrl: string;
  /** Empty string when configured with Upstash REST only. */
  redisUrl: string;
  upstashRedisRestUrl?: string | undefined;
  upstashRedisRestToken?: string | undefined;
  authSecret: string;
  authUrl: string;
  llmKeyEncryptionSecret: string;
  llmBaseUrl: string;
  llmApiKey?: string | undefined;
  llmModelChat: string;
  llmModelFast: string;
  allowPublicSignup: boolean;
  googleClientId?: string | undefined;
  googleClientSecret?: string | undefined;
  githubClientId?: string | undefined;
  githubClientSecret?: string | undefined;
  s3Endpoint: string;
  s3Bucket: string;
  s3PdfBucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3Region: string;
  importMaxFileBytes: number;
  importMaxTotalBytes: number;
  importMaxEntries: number;
  importMaxRatio: number;
  importMaxProjects: number;
  sentryDsn?: string | undefined;
  metricsToken?: string | undefined;
  nodeEnv: string;
}

export function loadWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  const raw: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) {
    // An empty value means "not set": `env_file: .env` passes `KEY=` through as
    // an empty string, and a present-but-empty optional key must not fail the
    // whole schema (that would 500 every mutating route while /api/health, which
    // never calls loadWebEnv, still answered 200).
    if (v !== undefined && v !== "") raw[k] = v;
  }
  const result = envVarSchema.safeParse(raw);

  // Cross-field rule: at least one complete Redis transport. Empty strings
  // were filtered out above, so truthiness here means "actually configured".
  const hasRedis =
    Boolean(raw.REDIS_URL) ||
    (Boolean(raw.UPSTASH_REDIS_REST_URL) &&
      Boolean(raw.UPSTASH_REDIS_REST_TOKEN));
  const lines = result.success
    ? []
    : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  if (!hasRedis) {
    lines.push(
      "REDIS_URL: set REDIS_URL or both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN",
    );
  }
  if (!result.success || !hasRedis) {
    throw new Error(
      `Invalid environment configuration:\n${lines.map((l) => `  - ${l}`).join("\n")}`,
    );
  }

  const v = result.data;
  return {
    databaseUrl: v.DATABASE_URL,
    redisUrl: v.REDIS_URL ?? "",
    upstashRedisRestUrl: v.UPSTASH_REDIS_REST_URL,
    upstashRedisRestToken: v.UPSTASH_REDIS_REST_TOKEN,
    authSecret: v.BETTER_AUTH_SECRET,
    authUrl: v.BETTER_AUTH_URL,
    llmKeyEncryptionSecret: v.LLM_KEY_ENCRYPTION_SECRET,
    llmBaseUrl: v.LLM_BASE_URL,
    llmApiKey: v.LLM_API_KEY,
    llmModelChat: v.LLM_MODEL_CHAT,
    llmModelFast: v.LLM_MODEL_FAST,
    allowPublicSignup: v.ALLOW_PUBLIC_SIGNUP ?? false,
    googleClientId: v.GOOGLE_CLIENT_ID,
    googleClientSecret: v.GOOGLE_CLIENT_SECRET,
    githubClientId: v.GITHUB_CLIENT_ID,
    githubClientSecret: v.GITHUB_CLIENT_SECRET,
    s3Endpoint: v.S3_ENDPOINT,
    s3Bucket: v.S3_BUCKET,
    s3PdfBucket: v.S3_PDF_BUCKET,
    s3AccessKey: v.S3_ACCESS_KEY,
    s3SecretKey: v.S3_SECRET_KEY,
    s3Region: v.S3_REGION,
    importMaxFileBytes: v.IMPORT_MAX_FILE_BYTES,
    importMaxTotalBytes: v.IMPORT_MAX_TOTAL_BYTES,
    importMaxEntries: v.IMPORT_MAX_ENTRIES,
    importMaxRatio: v.IMPORT_MAX_RATIO,
    importMaxProjects: v.IMPORT_MAX_PROJECTS,
    sentryDsn: v.SENTRY_DSN,
    metricsToken: v.METRICS_TOKEN,
    nodeEnv: v.NODE_ENV,
  };
}