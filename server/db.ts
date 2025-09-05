import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import { loadConfig } from './config';

const cfg = loadConfig();
const connectionString = cfg.DATABASE_URL_RESOLVED;

export const pool = new Pool({ 
  connectionString,
  ssl: {
    rejectUnauthorized: false // Required for Supabase connections
  }
});

export const db = drizzle(pool, { schema });