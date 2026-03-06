import { toNodeHandler } from "better-auth/node";
import express from "express";
import { auth } from "src/lib/auth";
const api = express.Router();

api.all("/auth/{*any}", toNodeHandler(auth));

export default api;
