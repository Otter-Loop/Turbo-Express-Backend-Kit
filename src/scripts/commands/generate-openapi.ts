import { writeFileSync } from "fs";
import path from "path";
import openAPIJSON from "../../lib/docs/swagger.config";

export const generateOpenAPI = () => {
  writeFileSync(
    path.join(process.cwd(), "static", "protected", "openapi.json"),
    JSON.stringify(openAPIJSON, null, 2),
  );
  console.log("Updated openapi.json at /static/protected/openapi.json");
  process.exit(0);
};
