import { NextFunction, Request, Response } from "express";
import { ROLE } from "../lib/auth/permissions";

// requires authenicated middleware to be called before this
export const roleMiddleware = (roles: ROLE[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authenicated = req.authenticated || false;
    if(authenicated==undefined) {
      console.warn("Using Role Middleware without authenicated middleware.");
    }
    if(!authenicated) return res.status(403).json({message: "You are not authenicated"});
    const user = req.user!
    if(!roles.includes(user.role! as ROLE)){
      return res.status(403).json({message: "This service is not allowed for you."})
    }
    return next();
  }
}