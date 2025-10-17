// api/src/config/env.ts
import * as fs from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

// W CommonJS __dirname/__filename są dostępne bez kombinacji
// a w CI uruchamiasz backend z katalogu "api", więc zwykłe dotenv.config() wystarczy.
const defaultResult = dotenv.config(); // ładuje api/.env (bo cwd=api)
dotenvExpand.expand(defaultResult);

// (opcjonalnie) fallback: jeśli jednak ktoś uruchomi z innego CWD, sprawdź kilka lokalizacji
if (!process.env.NODE_ENV) {
  const candidates = [
    path.resolve(process.cwd(), "api/.env"),
    path.resolve(process.cwd(), ".env")
  ];
  const envPath = candidates.find((p) => fs.existsSync(p));
  if (envPath) {
    dotenvExpand.expand(dotenv.config({ path: envPath }));
    if (process.env.NODE_ENV !== "production") {
      console.log("[env] fallback loaded from:", envPath);
    }
  }
}

const required = [
  "NODE_ENV",
  "SITE_URL",
  "DATABASE_URL",
  "JWT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SLACK_WEBHOOK_URL"
] as const;

const missing = required.filter((k) => !process.env[k] || process.env[k] === "");
if (missing.length) {
  throw new Error(`Missing env vars: ${missing.join(", ")}`);
}

export const env = {
  NODE_ENV: process.env.NODE_ENV!,
  IS_PROD: process.env.NODE_ENV === "production",
  SITE_URL: process.env.SITE_URL!,
  DATABASE_URL: process.env.DATABASE_URL!,
  JWT_SECRET: process.env.JWT_SECRET!,

  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY!,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,

  SMTP: {
    HOST: process.env.SMTP_HOST!,
    PORT: Number(process.env.SMTP_PORT!),
    USER: process.env.SMTP_USER!,
    PASS: process.env.SMTP_PASS!
  },

  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL!
} as const;

if (process.env.NODE_ENV !== "production") {
  console.log("[env] loaded .env via default CWD resolution");
}
