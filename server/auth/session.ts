import type { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { loadConfig } from "../config";

export function setupSession(app: Express) {
  const cfg = loadConfig();
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: cfg.DATABASE_URL_RESOLVED,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  app.use(
    session({
      secret: cfg.SESSION_SECRET_RESOLVED,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: cfg.IS_PRODUCTION,
        maxAge: sessionTtl,
      },
    })
  );
}
