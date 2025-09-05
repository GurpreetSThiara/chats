import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? `postgresql://postgres:${encodeURIComponent("qT*bk#sNPVF2gh_")}@db.ildxigzkdixzepsxslsl.supabase.co:5432/postgres`
  },
});
