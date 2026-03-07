// just forwards authenicated: boolean value to requestHandler function

// NOTE: donot use this on strictly protected routes

import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth";
export const softAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  req.authenticated = false;
  if (!session) return next();
  const user = session.user;
  if (user.banned) return next();
  req.user = session.user;
  req.session = session.session;
  req.authenticated = true;
  return next();
};
