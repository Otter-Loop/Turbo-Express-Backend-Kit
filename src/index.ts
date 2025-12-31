import express from "express"
import cors from "cors";
import morgan from "morgan";
import api from "./routes";
import root_cors_options from "./cors-options";
import application_config from "./config";
const app = express()
const port = 8000

app.use(
  cors(root_cors_options)
);

app.use(morgan("dev"));
app.use(application_config.root_base, api)

app.listen(port, () => {
  console.log(`Server listening on: ${port}`)
})