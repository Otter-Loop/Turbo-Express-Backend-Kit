import express from "express";
import cors from "cors";
import morgan from "morgan";
import router from "./routes";
import root_cors_options from "./cors-options";
const app = express();
const port = 8000;

app.use(cors(root_cors_options));

app.use(morgan("dev"));
app.use("/", router);

app.listen(port, () => {
  console.log(`App Name: ${process.env.APP_NAME || "Backend Kit"}`);
  console.log(`Server listening on: ${port}`);
});
