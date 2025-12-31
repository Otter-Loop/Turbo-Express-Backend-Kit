import type { Config } from "drizzle-kit";

type Dialect = "turso" | "gel" | "mysql" | "postgresql" | "singlestore" | "sqlite"

const dialect: Dialect = "postgresql"  // NOTE: configure as per your need
// NOTE: you also need to configure in ./src/services/database

export default {
  dialect: dialect,
  schema: "./src/services/database/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    host : process.env.DB_HOST!,
    port: process.env.DB_PORT
      ? Number(process.env.DB_PORT)
      : 3306,
    user: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_DATABASE!
  }
} satisfies Config;
