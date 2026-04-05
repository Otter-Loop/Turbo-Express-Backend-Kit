import express from "express";
import { authenticationMiddleware } from "../middleware/authentication-middleware";
import { inputValidationMiddleware } from "../middleware/route-input-validation-middleware";
import { bucket_folder, R2 } from "../services/object-storage";

import z from "zod";
import { AppError } from "../lib/turbo-express/lib/error";

const r2Router = express.Router();
r2Router.use(authenticationMiddleware);

/**
 * @swagger
 * tags:
 *   - name: R2
 *     description: R2 storage file operations
 *
 * components:
 *   schemas:
 *     UploadUrlRequest:
 *       type: object
 *       required: [fileName, fileCategory, contentType]
 *       properties:
 *         fileName:
 *           type: string
 *           minLength: 2
 *           description: Name of the file to upload
 *         fileCategory:
 *           type: string
 *           enum: [image, video, document] # replace with actual bucket_folder values
 *         contentType:
 *           type: string
 *           description: MIME type of the file
 *     UploadUrlResponse:
 *       type: object
 *       properties:
 *         key:
 *           type: string
 *         signedUrl:
 *           type: string
 *           format: uri
 *     AppErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         status:
 *           type: integer
 *         details:
 *           type: object
 *
 * /api/r2/upload-url:
 *   post:
 *     summary: Generate a signed upload URL for R2 storage
 *     tags: [R2]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UploadUrlRequest'
 *     responses:
 *       200:
 *         description: Signed URL generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadUrlResponse'
 *       409:
 *         description: Failed to generate signed URL
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AppErrorResponse'
 */
r2Router.post(
  "/upload-url",
  inputValidationMiddleware(
    z.object({
      body: z.object({
        fileName: z.string().min(2),
        fileCategory: z.enum(bucket_folder),
        contentType: z.string(),
      }),
    }),
    async (req, res) => {
      const body = req.validated.body;
      try {
        const { key, signedUrl } = await R2.getUploadSignedURL(
          body.fileCategory,
          body.fileName,
          body.contentType,
        );
        return res.json({ key, signedUrl });
      } catch (error) {
        throw new AppError("Failed to get signed url", 409, { error });
      }
    },
  ),
);

export default r2Router;
