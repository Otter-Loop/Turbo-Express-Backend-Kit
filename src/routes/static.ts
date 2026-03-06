import express from "express";
import path from "path";
import fs from "fs";
import { authenticationMiddleware } from "src/middleware/authentication-middleware";
import { roleMiddleware } from "src/middleware/role-middleware";
import { softAuthMiddleware } from "src/middleware/soft-auth-middleware";

const staticRouter = express.Router({});

staticRouter.use(
  "/protected",
  authenticationMiddleware,
  roleMiddleware(["admin"]),
  express.static(path.join(process.cwd(), "static", "protected")),
);

staticRouter.use(
  "/public",
  express.static(path.join(process.cwd(), "static", "public")),
);

staticRouter.use("/list", softAuthMiddleware, async (req, res) => {
  const publicFiles = fs.readdirSync(
    path.join(process.cwd(), "static", "public"),
  );
  let protectedFiles: string[] = [];
  if (req.user?.role == "admin") {
    protectedFiles = fs.readdirSync(
      path.join(process.cwd(), "static", "protected"),
    );
  }
  const baseURL = `${req.protocol}://${req.get("host")}`;
  const publicRecords = publicFiles.map((file) => ({
    name: file,
    url: `${baseURL}/static/public/${file}`,
  }));
  const protectedRecords = protectedFiles.map((file) => ({
    name: file,
    url: `${baseURL}/static/protected/${file}`,
  }));
  return res.json({
    public: publicRecords,
    protected: protectedRecords,
  });
});

export default staticRouter;
