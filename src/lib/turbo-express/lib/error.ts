export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public data?: Record<string, any>,
  ) {
    super(message);
    this.name = "AppError";
  }
}
