import type { NextFunction, Request, Response } from "express";

export const verifiedEmailUserMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authenicated = req.authenticated;
  if (authenicated == undefined) {
    console.warn("Using Role Middleware without authenicated middleware.");
  }
  if (!authenicated)
    return res.status(403).json({ message: "You are not authenicated" });
  if (!req.user!.emailVerified) {
    return res
      .status(403)
      .json({ message: "Email verification is required for this service" });
  }
  return next();
};
