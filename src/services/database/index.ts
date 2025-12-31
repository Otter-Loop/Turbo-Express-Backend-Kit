import { drizzle } from "drizzle-orm/node-postgres";
import { Environment } from "../../utils/environment";
import { Pool } from "pg";
import schema from "../../schema/index";

const pool = new Pool({
  host: Environment.db.host,
  port: Number(Environment.db.port),
  user: Environment.db.username,
  password: Environment.db.password,
  database: Environment.db.database,
});

export const db = drizzle(pool, {
  schema: schema,
});
