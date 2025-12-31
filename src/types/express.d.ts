import { auth } from "../lib/auth";

type Session = typeof auth.$Infer.Session.session;
type User = typeof auth.$Infer.Session.user;
declare global {
  namespace Express {
    interface Request {
      authenticated?: boolean;
      user?: User;
      session?: Session;
      validated?: any;
    }
  }
}

export {};