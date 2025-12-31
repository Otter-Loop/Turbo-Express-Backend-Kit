import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, openAPI } from "better-auth/plugins"
import { db } from "../../services/database";

import { Environment } from "../../utils/environment";
import { roles } from "./permissions";
import schema from "../../schema/index";

const MAX_SESSIONS_PER_USER = 2

export const auth = betterAuth({
  basePath: "/api/auth",
  secret: Environment.better_auth_secret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema,
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: true,
    minPasswordLength: 6,
  },
  socialProviders: {
    google: {
      clientId: Environment.socials.google.client_id,
      clientSecret: Environment.socials.google.client_secret,
    }
  },
  logger: {
    log(level, message, ...args) {
      console.log({ level, message, args: args })
    },
  },
  hooks: {
    // after: () => {

    // }
  },
  plugins: [
    admin({
      adminRoles: ["admin"],
      bannedUserMessage: "You are temporarily prohibited from using this service.",
      defaultBanReason: "Suspicious Actions.",
      defaultRole: "student",
      roles: roles
    }),
    openAPI({
      path: "/docs",
    })
  ],
  advanced: {
    disableOriginCheck: Environment.is_in_development,
    disableCSRFCheck: Environment.is_in_development
  }
});