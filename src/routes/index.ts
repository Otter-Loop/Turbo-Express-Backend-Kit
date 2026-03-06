import express from "express";
import { Environment } from "../utils/environment";
import { apiReference } from "@scalar/express-api-reference";
import staticRouter from "./static";
import api from "./api";
import testRouter from "./test";

const router = express.Router();

// api docs
router.get(
  "/docs",
  apiReference({ url: "/static/public/openapi.json", title: "API Reference" }),
);

// static files
router.use("/static", staticRouter);

// api routes
router.use("/api", api);

// health check
router.get("/health", async (req, res) => {
  if (Environment.is_in_development) {
    return res.json({
      Environment,
    });
  }
  return res.json({
    message: "Backend kit is live.",
  });
});

/* your routes here */

router.use("/test", testRouter.getRouter());

export default router;
