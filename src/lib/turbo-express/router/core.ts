import { Router } from "express";
import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
  Application,
} from "express";
import { ZodObject, type ZodRawShape, z, ZodError } from "zod";

/**
 * Extended Request type with validated data
 * This is what gets passed to route handlers
 */
export interface ZodRequest<
  T extends ZodObject<ZodRawShape> = ZodObject<ZodRawShape>,
> extends Request {
  validated: z.infer<T>;
}

/**
 * Route handler with full type inference
 */
export type ZodRouteHandler<T extends ZodObject<ZodRawShape>> = (
  req: ZodRequest<T>,
  res: Response,
  next?: NextFunction,
) => void | Promise<void> | Promise<any>;

/**
 * Validation configuration
 */
export interface ValidationConfig {
  onValidationError?: (error: ZodError, req: Request, res: Response) => any;
  includeErrorDetails?: boolean;
  logErrors?: boolean;
}

/**
 * Creates validation middleware with full type safety
 */
const createValidationMiddleware = <T extends ZodObject<ZodRawShape>>(
  schema: T,
  handler: ZodRouteHandler<T>,
  config: ValidationConfig = {},
): RequestHandler => {
  const {
    onValidationError,
    includeErrorDetails = true,
    logErrors = true,
  } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.safeParse({
        body: req.body,
        query: req.query,
        params: req.params,
        headers: req.headers,
      });

      if (!parsed.success) {
        if (onValidationError) {
          const customResponse = onValidationError(parsed.error, req, res);
          if (customResponse) {
            return res.status(400).json(customResponse);
          }
        }

        // Fix: Use parsed.error.issues instead of parsed.error.errors
        const errorResponse: any = {
          message: "Validation failed",
          errors: parsed.error.issues.map((issue: any) => ({
            path: issue.path.join("."),
            message: issue.message,
            code: issue.code,
          })),
        };

        if (includeErrorDetails) {
          try {
            errorResponse.schema = schema.toJSONSchema({
              target: "openapi-3.0",
              unrepresentable: "any",
            } as any);
          } catch {
            // Schema conversion might fail
          }
        }

        if (logErrors) {
          console.warn("Validation Error:", {
            path: req.path,
            method: req.method,
            timestamp: new Date().toISOString(),
          });
        }

        return res.status(400).json(errorResponse);
      }

      (req as any).validated = parsed.data;

      const result = await handler(req as ZodRequest<T>, res, next);
      return result;
    } catch (error: unknown) {
      // Fix: Properly type the error parameter
      if (res.headersSent) {
        return next(error as Error);
      }

      if (logErrors) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error("Route Handler Error:", {
          error: errorMessage,
          path: req.path,
          method: req.method,
        });
      }

      return res.status(500).json({
        message: "Internal Server Error",
      });
    }
  };
};

/**
 * ZodRoute builder with proper type inference for each method
 * This class handles the chaining logic and maintains schema state
 */
class ZodRoute {
  private route: any;
  private currentSchema?: ZodObject<ZodRawShape>;
  private validationConfig: ValidationConfig;

  constructor(route: any, validationConfig: ValidationConfig = {}) {
    this.route = route;
    this.validationConfig = validationConfig;
  }

  /**
   * Set schema and return typed builder
   * The return type ensures proper inference in the chain
   */
  schema<T extends ZodObject<ZodRawShape>>(
    schemaParam: T,
  ): ZodRouteWithSchema<T> {
    this.currentSchema = schemaParam;
    return new ZodRouteWithSchema(
      this.route,
      schemaParam,
      this.validationConfig,
    );
  }

  /**
   * Without schema - route methods available but no validation
   */
  get(path: string, handler: RequestHandler): this;
  get(path: string, middleware: RequestHandler, handler: RequestHandler): this;
  get(path: string, ...args: any[]): this {
    this._addRoute("get", path, args);
    return this;
  }

  post(path: string, handler: RequestHandler): this;
  post(path: string, middleware: RequestHandler, handler: RequestHandler): this;
  post(path: string, ...args: any[]): this {
    this._addRoute("post", path, args);
    return this;
  }

  put(path: string, handler: RequestHandler): this;
  put(path: string, middleware: RequestHandler, handler: RequestHandler): this;
  put(path: string, ...args: any[]): this {
    this._addRoute("put", path, args);
    return this;
  }

  patch(path: string, handler: RequestHandler): this;
  patch(
    path: string,
    middleware: RequestHandler,
    handler: RequestHandler,
  ): this;
  patch(path: string, ...args: any[]): this {
    this._addRoute("patch", path, args);
    return this;
  }

  delete(path: string, handler: RequestHandler): this;
  delete(
    path: string,
    middleware: RequestHandler,
    handler: RequestHandler,
  ): this;
  delete(path: string, ...args: any[]): this {
    this._addRoute("delete", path, args);
    return this;
  }

  head(path: string, handler: RequestHandler): this;
  head(path: string, middleware: RequestHandler, handler: RequestHandler): this;
  head(path: string, ...args: any[]): this {
    this._addRoute("head", path, args);
    return this;
  }

  options(path: string, handler: RequestHandler): this;
  options(
    path: string,
    middleware: RequestHandler,
    handler: RequestHandler,
  ): this;
  options(path: string, ...args: any[]): this {
    this._addRoute("options", path, args);
    return this;
  }

  private _addRoute(method: string, path: string, args: any[]): void {
    const handler = args[args.length - 1] as RequestHandler;
    const middlewares = args.slice(0, -1) as RequestHandler[];

    const allMiddlewares: RequestHandler[] = [...middlewares];

    if (this.currentSchema) {
      const validationMiddleware = createValidationMiddleware(
        this.currentSchema,
        handler as any,
        this.validationConfig,
      );
      allMiddlewares.push(validationMiddleware);
    } else {
      allMiddlewares.push(handler);
    }

    (this.route as any)[method](path, ...allMiddlewares);
  }

  native(): any {
    return this.route;
  }
}

/**
 * ZodRouteWithSchema - Builder with schema context
 * This class provides FULLY TYPED route methods based on the schema
 */
class ZodRouteWithSchema<T extends ZodObject<ZodRawShape>> {
  private route: any;
  private currentSchema: T;
  private validationConfig: ValidationConfig;

  constructor(
    route: any,
    schemaParam: T,
    validationConfig: ValidationConfig = {},
  ) {
    this.route = route;
    this.currentSchema = schemaParam;
    this.validationConfig = validationConfig;
  }

  /**
   * Change schema and return new builder
   * Breaks the current chain
   */
  schema<T2 extends ZodObject<ZodRawShape>>(
    schemaParam: T2,
  ): ZodRouteWithSchema<T2> {
    return new ZodRouteWithSchema(
      this.route,
      schemaParam,
      this.validationConfig,
    );
  }

  /**
   * GET with full type inference from schema
   * req, res, and req.validated are all properly typed
   */
  get(path: string, handler: ZodRouteHandler<T>): this;
  get(
    path: string,
    middleware: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  get(
    path: string,
    middleware: RequestHandler,
    middleware2: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  get(path: string, ...args: any[]): this {
    this._addRoute("get", path, args);
    return this;
  }

  /**
   * POST with full type inference from schema
   */
  post(path: string, handler: ZodRouteHandler<T>): this;
  post(
    path: string,
    middleware: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  post(
    path: string,
    middleware: RequestHandler,
    middleware2: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  post(path: string, ...args: any[]): this {
    this._addRoute("post", path, args);
    return this;
  }

  /**
   * PUT with full type inference from schema
   */
  put(path: string, handler: ZodRouteHandler<T>): this;
  put(
    path: string,
    middleware: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  put(
    path: string,
    middleware: RequestHandler,
    middleware2: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  put(path: string, ...args: any[]): this {
    this._addRoute("put", path, args);
    return this;
  }

  /**
   * PATCH with full type inference from schema
   */
  patch(path: string, handler: ZodRouteHandler<T>): this;
  patch(
    path: string,
    middleware: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  patch(
    path: string,
    middleware: RequestHandler,
    middleware2: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  patch(path: string, ...args: any[]): this {
    this._addRoute("patch", path, args);
    return this;
  }

  /**
   * DELETE with full type inference from schema
   */
  delete(path: string, handler: ZodRouteHandler<T>): this;
  delete(
    path: string,
    middleware: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  delete(
    path: string,
    middleware: RequestHandler,
    middleware2: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  delete(path: string, ...args: any[]): this {
    this._addRoute("delete", path, args);
    return this;
  }

  /**
   * HEAD with full type inference from schema
   */
  head(path: string, handler: ZodRouteHandler<T>): this;
  head(
    path: string,
    middleware: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  head(
    path: string,
    middleware: RequestHandler,
    middleware2: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  head(path: string, ...args: any[]): this {
    this._addRoute("head", path, args);
    return this;
  }

  /**
   * OPTIONS with full type inference from schema
   */
  options(path: string, handler: ZodRouteHandler<T>): this;
  options(
    path: string,
    middleware: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  options(
    path: string,
    middleware: RequestHandler,
    middleware2: RequestHandler,
    handler: ZodRouteHandler<T>,
  ): this;
  options(path: string, ...args: any[]): this {
    this._addRoute("options", path, args);
    return this;
  }

  private _addRoute(method: string, path: string, args: any[]): void {
    const handler = args[args.length - 1] as ZodRouteHandler<T>;
    const middlewares = args.slice(0, -1) as RequestHandler[];

    const allMiddlewares: RequestHandler[] = [...middlewares];

    const validationMiddleware = createValidationMiddleware(
      this.currentSchema,
      handler,
      this.validationConfig,
    );
    allMiddlewares.push(validationMiddleware);

    (this.route as any)[method](path, ...allMiddlewares);
  }

  native(): any {
    return this.route;
  }
}

/**
 * ZodRouter - Main class for creating routers with Zod validation
 * Provides full TypeScript support with schema-based type inference
 */
export class ZodRouter {
  private router: Router;
  private validationConfig: ValidationConfig;

  constructor(
    router: Router = Router(),
    validationConfig: ValidationConfig = {},
  ) {
    this.router = router;
    this.validationConfig = validationConfig;
  }

  /**
   * Set schema and get typed builder
   */
  schema<T extends ZodObject<ZodRawShape>>(
    schemaParam: T,
  ): ZodRouteWithSchema<T> {
    return new ZodRouteWithSchema(
      this.router,
      schemaParam,
      this.validationConfig,
    );
  }

  /**
   * Native Express .use() for global middleware
   */
  use(...args: any[]): this {
    this.router.use(...args);
    return this;
  }

  /**
   * GET without schema
   */
  get(path: string, handler: RequestHandler): this;
  get(path: string, middleware: RequestHandler, handler: RequestHandler): this;
  get(path: string, ...args: any[]): this {
    const handler = args[args.length - 1] as RequestHandler;
    const middlewares = args.slice(0, -1) as RequestHandler[];
    this.router.get(path, ...middlewares, handler);
    return this;
  }

  /**
   * POST without schema
   */
  post(path: string, handler: RequestHandler): this;
  post(path: string, middleware: RequestHandler, handler: RequestHandler): this;
  post(path: string, ...args: any[]): this {
    const handler = args[args.length - 1] as RequestHandler;
    const middlewares = args.slice(0, -1) as RequestHandler[];
    this.router.post(path, ...middlewares, handler);
    return this;
  }

  /**
   * PUT without schema
   */
  put(path: string, handler: RequestHandler): this;
  put(path: string, middleware: RequestHandler, handler: RequestHandler): this;
  put(path: string, ...args: any[]): this {
    const handler = args[args.length - 1] as RequestHandler;
    const middlewares = args.slice(0, -1) as RequestHandler[];
    this.router.put(path, ...middlewares, handler);
    return this;
  }

  /**
   * PATCH without schema
   */
  patch(path: string, handler: RequestHandler): this;
  patch(
    path: string,
    middleware: RequestHandler,
    handler: RequestHandler,
  ): this;
  patch(path: string, ...args: any[]): this {
    const handler = args[args.length - 1] as RequestHandler;
    const middlewares = args.slice(0, -1) as RequestHandler[];
    this.router.patch(path, ...middlewares, handler);
    return this;
  }

  /**
   * DELETE without schema
   */
  delete(path: string, handler: RequestHandler): this;
  delete(
    path: string,
    middleware: RequestHandler,
    handler: RequestHandler,
  ): this;
  delete(path: string, ...args: any[]): this {
    const handler = args[args.length - 1] as RequestHandler;
    const middlewares = args.slice(0, -1) as RequestHandler[];
    this.router.delete(path, ...middlewares, handler);
    return this;
  }

  /**
   * HEAD without schema
   */
  head(path: string, handler: RequestHandler): this;
  head(path: string, middleware: RequestHandler, handler: RequestHandler): this;
  head(path: string, ...args: any[]): this {
    const handler = args[args.length - 1] as RequestHandler;
    const middlewares = args.slice(0, -1) as RequestHandler[];
    this.router.head(path, ...middlewares, handler);
    return this;
  }

  /**
   * OPTIONS without schema
   */
  options(path: string, handler: RequestHandler): this;
  options(
    path: string,
    middleware: RequestHandler,
    handler: RequestHandler,
  ): this;
  options(path: string, ...args: any[]): this {
    const handler = args[args.length - 1] as RequestHandler;
    const middlewares = args.slice(0, -1) as RequestHandler[];
    this.router.options(path, ...middlewares, handler);
    return this;
  }

  /**
   * ALL methods
   */
  all(path: string, handler: RequestHandler): this;
  all(path: string, middleware: RequestHandler, handler: RequestHandler): this;
  all(path: string, ...args: any[]): this {
    const handler = args[args.length - 1] as RequestHandler;
    const middlewares = args.slice(0, -1) as RequestHandler[];
    this.router.all(path, ...middlewares, handler);
    return this;
  }

  /**
   * Get native Express Router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Register with Express app
   */
  registerWith(app: Application, basePath: string = ""): void {
    app.use(basePath, this.router);
  }
}

/**
 * Factory to create ZodRouter
 */
export const createZodRouter = (options?: {
  validationConfig?: ValidationConfig;
}): ZodRouter => {
  return new ZodRouter(Router(), options?.validationConfig);
};

/**
 * Enhance existing Express router with Zod support
 */
export const enhanceRouter = (
  expressRouter: Router,
  validationConfig?: ValidationConfig,
): ZodRouter => {
  return new ZodRouter(expressRouter, validationConfig);
};
