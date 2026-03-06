import { ZodObject, ZodRawShape, z, ZodError } from "zod";
import {
  Request,
  Response,
  NextFunction,
  Router,
  RequestHandler,
  Application,
} from "express";
import { AppError } from "src/utils/error";

/**
 * Extended Request type that includes validated data
 * This maintains Express's Request interface while adding validated property
 */
export interface ZodRequest<T extends ZodObject<ZodRawShape>> extends Request {
  validated: z.infer<T>;
}

/**
 * Route handler with automatic type inference from Zod schema
 */
type ZodRouteHandler<T extends ZodObject<ZodRawShape>> = (
  req: ZodRequest<T>,
  res: Response,
  next: NextFunction,
) => void | Promise<void> | Promise<any>;

/**
 * Configuration for validation behavior
 */
interface ValidationConfig {
  /**
   * Custom error handler for validation failures
   */
  onValidationError?: (error: ZodError, req: Request, res: Response) => any;
  /**
   * Include full error details in response
   */
  includeErrorDetails?: boolean;
  /**
   * Log validation errors
   */
  logErrors?: boolean;
}

/**
 * Options for route registration
 */
interface RouteOptions {
  /**
   * Validation configuration for this route
   */
  validation?: ValidationConfig;
  /**
   * Additional middleware to run before the handler
   */
  middleware?: RequestHandler[];
}

/**
 * Middleware that validates request against Zod schema
 * and attaches validated data to req.validated
 */
const createZodValidationMiddleware = <T extends ZodObject<ZodRawShape>>(
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
      // Validate the request
      const parsed = schema.safeParse({
        body: req.body,
        query: req.query,
        params: req.params,
        headers: req.headers,
      });

      if (!parsed.success) {
        // Custom error handler
        if (onValidationError) {
          const customResponse = onValidationError(parsed.error, req, res);
          if (customResponse) {
            return res.status(400).json(customResponse);
          }
        }

        // Default error response
        const errorResponse: any = {
          message: "Validation failed",
          errors: parsed.error.issues.map((err) => ({
            path: err.path.join("."),
            message: err.message,
            code: err.code,
          })),
        };

        // Include full schema for development
        if (includeErrorDetails) {
          errorResponse.schema = schema.toJSONSchema({
            target: "openapi-3.0",
            unrepresentable: "any",
          } as any);
        }

        if (logErrors) {
          console.warn("Validation Error:", {
            path: req.path,
            method: req.method,
            errors: parsed.error.issues,
          });
        }

        return res.status(400).json(errorResponse);
      }

      // Attach validated data to request
      (req as any).validated = parsed.data;

      // Execute the handler
      const result = await handler(req as ZodRequest<T>, res, next);

      return result;
    } catch (error) {
      // Don't override response if headers already sent
      if (res.headersSent) {
        return next(error);
      }

      // Handle AppError
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          message: error.message,
          ...(error.data && { data: error.data }),
        });
      }

      // Log unexpected errors
      if (logErrors) {
        console.error("Route Handler Error:", {
          error: error instanceof Error ? error.message : String(error),
          path: req.path,
          method: req.method,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }

      // Return generic error
      return res.status(500).json({
        message: "Internal Server Error",
      });
    }
  };
};

/**
 * Enhanced Express Route with Zod support
 * Extends Express's Route class to add type-safe methods
 */
class ZodEnhancedRoute {
  private route: any;
  private defaultConfig: RouteOptions = {};

  constructor(route: any) {
    this.route = route;
  }

  /**
   * Set default validation config for all methods on this route
   */
  setValidationConfig(config: ValidationConfig): this {
    this.defaultConfig.validation = config;
    return this;
  }

  /**
   * Set default middleware for all methods on this route
   */
  setMiddleware(...middleware: RequestHandler[]): this {
    this.defaultConfig.middleware = middleware;
    return this;
  }

  /**
   * Handle GET request with Zod validation
   */
  get<T extends ZodObject<ZodRawShape>>(
    schema: T,
    handler: ZodRouteHandler<T>,
    options?: RouteOptions,
  ): this {
    const config = { ...this.defaultConfig, ...options };
    const middleware = createZodValidationMiddleware(
      schema,
      handler,
      config.validation,
    );

    if (config.middleware && config.middleware.length > 0) {
      this.route.get(...config.middleware, middleware);
    } else {
      this.route.get(middleware);
    }

    return this;
  }

  /**
   * Handle POST request with Zod validation
   */
  post<T extends ZodObject<ZodRawShape>>(
    schema: T,
    handler: ZodRouteHandler<T>,
    options?: RouteOptions,
  ): this {
    const config = { ...this.defaultConfig, ...options };
    const middleware = createZodValidationMiddleware(
      schema,
      handler,
      config.validation,
    );

    if (config.middleware && config.middleware.length > 0) {
      this.route.post(...config.middleware, middleware);
    } else {
      this.route.post(middleware);
    }

    return this;
  }

  /**
   * Handle PUT request with Zod validation
   */
  put<T extends ZodObject<ZodRawShape>>(
    schema: T,
    handler: ZodRouteHandler<T>,
    options?: RouteOptions,
  ): this {
    const config = { ...this.defaultConfig, ...options };
    const middleware = createZodValidationMiddleware(
      schema,
      handler,
      config.validation,
    );

    if (config.middleware && config.middleware.length > 0) {
      this.route.put(...config.middleware, middleware);
    } else {
      this.route.put(middleware);
    }

    return this;
  }

  /**
   * Handle PATCH request with Zod validation
   */
  patch<T extends ZodObject<ZodRawShape>>(
    schema: T,
    handler: ZodRouteHandler<T>,
    options?: RouteOptions,
  ): this {
    const config = { ...this.defaultConfig, ...options };
    const middleware = createZodValidationMiddleware(
      schema,
      handler,
      config.validation,
    );

    if (config.middleware && config.middleware.length > 0) {
      this.route.patch(...config.middleware, middleware);
    } else {
      this.route.patch(middleware);
    }

    return this;
  }

  /**
   * Handle DELETE request with Zod validation
   */
  delete<T extends ZodObject<ZodRawShape>>(
    schema: T,
    handler: ZodRouteHandler<T>,
    options?: RouteOptions,
  ): this {
    const config = { ...this.defaultConfig, ...options };
    const middleware = createZodValidationMiddleware(
      schema,
      handler,
      config.validation,
    );

    if (config.middleware && config.middleware.length > 0) {
      this.route.delete(...config.middleware, middleware);
    } else {
      this.route.delete(middleware);
    }

    return this;
  }

  /**
   * Handle HEAD request with Zod validation
   */
  head<T extends ZodObject<ZodRawShape>>(
    schema: T,
    handler: ZodRouteHandler<T>,
    options?: RouteOptions,
  ): this {
    const config = { ...this.defaultConfig, ...options };
    const middleware = createZodValidationMiddleware(
      schema,
      handler,
      config.validation,
    );

    if (config.middleware && config.middleware.length > 0) {
      this.route.head(...config.middleware, middleware);
    } else {
      this.route.head(middleware);
    }

    return this;
  }

  /**
   * Handle OPTIONS request with Zod validation
   */
  options<T extends ZodObject<ZodRawShape>>(
    schema: T,
    handler: ZodRouteHandler<T>,
    options?: RouteOptions,
  ): this {
    const config = { ...this.defaultConfig, ...options };
    const middleware = createZodValidationMiddleware(
      schema,
      handler,
      config.validation,
    );

    if (config.middleware && config.middleware.length > 0) {
      this.route.options(...config.middleware, middleware);
    } else {
      this.route.options(middleware);
    }

    return this;
  }

  /**
   * Access the underlying Express route for native methods
   */
  native(): any {
    return this.route;
  }
}

/**
 * Enhanced Express Router with Zod support
 * Extends Express Router while maintaining all native functionality
 */
class ZodRouter {
  private router: Router;
  private globalValidationConfig: ValidationConfig = {};
  private globalMiddleware: RequestHandler[] = [];

  constructor(router: Router = Router()) {
    this.router = router;
  }

  /**
   * Set global validation configuration for all routes
   */
  setGlobalValidationConfig(config: ValidationConfig): this {
    this.globalValidationConfig = config;
    return this;
  }

  /**
   * Add global middleware to all routes
   */
  useGlobal(...middleware: RequestHandler[]): this {
    this.globalMiddleware.push(...middleware);
    this.router.use(...middleware);
    return this;
  }

  /**
   * Use standard Express middleware
   */
  use(...args: any[]): this {
    this.router.use(...args);
    return this;
  }

  /**
   * Create a new route with Zod support
   */
  route(path: string): ZodEnhancedRoute {
    const route = this.router.route(path);
    const zodRoute = new ZodEnhancedRoute(route);
    zodRoute.setValidationConfig(this.globalValidationConfig);

    if (this.globalMiddleware.length > 0) {
      zodRoute.setMiddleware(...this.globalMiddleware);
    }

    return zodRoute;
  }

  /**
   * Access native Express router methods
   */
  native(): Router {
    return this.router;
  }

  /**
   * Get the underlying Express router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Proxy for standard Express router methods (get, post, etc)
   */
  all(path: string, ...args: any[]): this {
    this.router.all(path, ...args);
    return this;
  }

  get(path: string, ...args: any[]): this {
    this.router.get(path, ...args);
    return this;
  }

  post(path: string, ...args: any[]): this {
    this.router.post(path, ...args);
    return this;
  }

  put(path: string, ...args: any[]): this {
    this.router.put(path, ...args);
    return this;
  }

  patch(path: string, ...args: any[]): this {
    this.router.patch(path, ...args);
    return this;
  }

  delete(path: string, ...args: any[]): this {
    this.router.delete(path, ...args);
    return this;
  }

  head(path: string, ...args: any[]): this {
    this.router.head(path, ...args);
    return this;
  }

  options(path: string, ...args: any[]): this {
    this.router.options(path, ...args);
    return this;
  }

  /**
   * Register this router with an Express app
   */
  registerWith(app: Application, basePath: string = ""): void {
    app.use(basePath, this.router);
  }
}

/**
 * Factory function to create a Zod-enabled Express Router
 */
export const createZodRouter = (options?: {
  validationConfig?: ValidationConfig;
  globalMiddleware?: RequestHandler[];
}): ZodRouter => {
  const router = new ZodRouter();

  if (options?.validationConfig) {
    router.setGlobalValidationConfig(options.validationConfig);
  }

  if (options?.globalMiddleware && options.globalMiddleware.length > 0) {
    router.useGlobal(...options.globalMiddleware);
  }

  return router;
};

export type { ZodRouteHandler, ValidationConfig, RouteOptions };
