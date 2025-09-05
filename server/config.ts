import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema> & {
  DATABASE_URL_RESOLVED: string;
  SESSION_SECRET_RESOLVED: string;
  IS_PRODUCTION: boolean;
};

export function loadConfig(): AppConfig {
  const parsed = envSchema.parse(process.env);

  // Fallbacks to preserve current behavior if envs are not set
  const password = encodeURIComponent("qT*bk#sNPVF2gh_");
  const defaultDb = `postgres://postgres:${password}@db.ildxigzkdixzepsxslsl.supabase.co:5432/postgres?sslmode=require`;

  const DATABASE_URL_RESOLVED = parsed.DATABASE_URL || defaultDb;
  const SESSION_SECRET_RESOLVED = parsed.SESSION_SECRET || "your-secret-key";
  const IS_PRODUCTION = parsed.NODE_ENV === "production";

  return {
    ...parsed,
    DATABASE_URL_RESOLVED,
    SESSION_SECRET_RESOLVED,
    IS_PRODUCTION,
  };
}
