import { ZodObject, type ZodRawShape, z } from "zod";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { AppError } from "../utils/error";

// TODO: handle database and other system errors automatically

type ValidatedRequest<T extends ZodObject<ZodRawShape>> = Omit<
  Request,
  "validated"
> & {
  validated: z.infer<T>;
};

export const inputValidationMiddleware = <T extends ZodObject<ZodRawShape>>(
  schema: T,
  handler: (
    req: ValidatedRequest<T>,
    res: Response,
    next: NextFunction,
  ) => void | Promise<void> | Promise<any>,
): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate input
      const parsed = schema.safeParse({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      if (!parsed.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: parsed.error,
          schema: schema.toJSONSchema({
            target: "openapi-3.0",
            unrepresentable: "any",
            override: (ctx) => {
              const def = ctx.zodSchema._zod.def;
              if (def.type === "date") {
                ctx.jsonSchema.type = "string";
                ctx.jsonSchema.format = "date-time";
              }
            },
          }),
        });
      }

      req.validated = parsed.data;

      // Call the handler with typed request
      const result = await handler(req as ValidatedRequest<T>, res, next);
      return result;
    } catch (error) {
      if (res.headersSent) {
        return next(error);
      }

      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          message: error.message,
          ...(error.data && { data: error.data }), // Spread the data object
        });
      }

      console.log({ error });

      return res.status(500).json({
        message: "Failed Action",
        error: error,
      });
    }
  };
};
