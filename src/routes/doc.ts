import { apiReference } from "@scalar/express-api-reference";
import express from "express";
import { authenticationMiddleware } from "../middleware/authentication-middleware";
import { roleMiddleware } from "../middleware/role-middleware";
const docsRouter = express.Router();

// NOTE: Docs are protected by admin role by default. You can update the middleware to fit your needs.
docsRouter.use(authenticationMiddleware, roleMiddleware(["admin"]));

docsRouter.get(
  "/",
  apiReference({
    sources: [
      { url: "/static/protected/openapi.json", title: "API Reference" },
      { url: "/api/auth/open-api/generate-schema", title: "Auth" },
    ],
    hideClientButton: true,
    isEditable: false,
    showDeveloperTools: "never",
  }),
);

export default docsRouter;
