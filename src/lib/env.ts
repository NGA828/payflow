import { z } from "zod";

/**
 * Server-side environment validation. Fails fast with a readable report instead
 * of letting the app drift into undefined behavior. Never import from client code.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
  APP_URL: z.url().default("http://localhost:3000"),

  REDIS_URL: z.string().optional(),
  QUEUE_DRIVER: z.enum(["auto", "bullmq", "inline"]).default("auto"),

  EMAIL_PROVIDER: z.enum(["console", "smtp", "resend"]).default("console"),
  EMAIL_FROM: z.string().default("PayFlow <noreply@payflow.test>"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  BILLING_PROVIDER: z.enum(["mock", "stripe"]).default("mock"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_DIR: z.string().default("./storage"),

  RATE_LIMIT_DRIVER: z.enum(["memory", "redis"]).default("memory"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  SEED_ADMIN_PASSWORD: z.string().optional(),
  DATABASE_URL_TEST: z.string().optional(),
  PGLITE_DATA: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = result.data;
  return cached;
}

/** The queue driver that will actually be used, resolved from config + availability. */
export function resolveQueueDriver(env: Env): "bullmq" | "inline" {
  if (env.QUEUE_DRIVER === "inline") return "inline";
  if (env.QUEUE_DRIVER === "bullmq") return "bullmq";
  return env.REDIS_URL ? "bullmq" : "inline";
}
