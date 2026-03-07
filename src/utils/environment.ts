import dotenv from "dotenv";
dotenv.config({ quiet: true });

const required_environments = [
  "APP_NAME",
  "DB_CONNECTION",
  "DB_HOST",
  "DB_PORT",
  "DB_DATABASE",
  "DB_USERNAME",
  "DB_PASSWORD",
  "REDIS_HOST",
  "REDIS_PASSWORD",
  "REDIS_PORT",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "FACEBOOK_CLIENT_ID",
  "FACEBOOK_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "EMAIL_ENGINE_USER",
  "EMAIL_ENGINE_PASSWORD",
  "EMAIL_ENGINE_SERVICE",
] as const;

const missed_vars: string[] = [];
for (const envVar of required_environments) {
  if (!process.env[envVar]) {
    missed_vars.push(envVar);
  }
}

if (missed_vars.length > 0) {
  throw new Error(
    "Following variables are required but not set\n" + missed_vars.join(",\n"),
  );
}

export const Environment = {
  name: process.env.APP_NAME!,
  db: {
    connection: process.env.DB_CONNECTION!,
    host: process.env.DB_HOST!,
    port: process.env.DB_PORT!,
    database: process.env.DB_DATABASE!,
    username: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
  },
  redis: {
    host: process.env.REDIS_HOST!,
    password: process.env.REDIS_PASSWORD!,
    port: process.env.REDIS_PORT!,
  },
  r2: {
    account_id: process.env.R2_ACCOUNT_ID!,
    access_key: process.env.R2_ACCESS_KEY_ID!,
    secret_access_key: process.env.R2_SECRET_ACCESS_KEY!,
    bucket_name: process.env.R2_BUCKET_NAME!,
    endpoint: process.env.R2_ENDPOINT!,
  },
  socials: {
    google: {
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  better_auth_secret: process.env.BETTER_AUTH_SECRET!,
  is_in_development: (process.env.NODE_ENV || "development") === "development",
  email: {
    service: process.env.EMAIL_ENGINE_SERVICE!,
    user: process.env.EMAIL_ENGINE_USER!,
    password: process.env.EMAIL_ENGINE_PASSWORD!,
  },
};
