import swaggerJsdoc from 'swagger-jsdoc';
import { fileURLToPath } from "url";
import path from "path";
import { writeFileSync } from 'fs';
import { Environment } from 'src/utils/environment';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API',
      version: '1.0.0',
    },
  },
  apis: [
    path.join(__dirname, "../../routes/**/*.ts")
  ],
};
const swaggerSpec = swaggerJsdoc(options);

if(Environment.is_in_development){
  writeFileSync(path.join(__dirname, "../../openapi.json"), JSON.stringify(swaggerSpec, null, 2));
}

export default swaggerSpec