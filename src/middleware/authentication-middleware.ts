import { fromNodeHeaders } from "better-auth/node";
import { Request, Response, NextFunction} from "express";
import { auth } from "../lib/auth";
export const authenticationMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if(req.authenticated) return next(); // skip checking if authenticated is set true (by soft-auth-middleware)
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers)
  })
  if(!session) return res.status(403).json({message: "You are not authenticated"});
  const user = session.user
  if(user.banned) return res.status(403).json({message: user.banReason});
  req.user = session.user;
  req.session = session.session;
  req.authenticated = true;
  return next();
}