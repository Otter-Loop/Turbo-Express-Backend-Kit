import swaggerJSDoc from "swagger-jsdoc";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const openAPIContract = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    // NOTE: Update the info section to fit your application.
    info: {
      title: "API Reference",
      version: "1.0.0",
      description:
        "This is the API reference for the application. You can find all the available endpoints and their details here.",
    },
  },
  // NOTE: By default swagger docs are searched for files with .swagger.ts extension. You can update the pattern to fit your needs.
  apis: [path.join(__dirname, "**/*.swagger.ts")],
});

export default openAPIContract;
