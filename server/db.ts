import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// if (!process.env.DATABASE_URL) {
//   throw new Error(
//     "DATABASE_URL must be set. Did you forget to provision a database?",
//   );
// }

// Construct the connection string with properly encoded components
const password = encodeURIComponent("qT*bk#sNPVF2gh_");
const connectionString = process.env.DATABASE_URL || `postgres://postgres:${password}@db.ildxigzkdixzepsxslsl.supabase.co:5432/postgres?sslmode=require`;

export const pool = new Pool({ 
  connectionString,
  ssl: {
    rejectUnauthorized: false // Required for Supabase connections
  }
});

export const db = drizzle(pool, { schema });