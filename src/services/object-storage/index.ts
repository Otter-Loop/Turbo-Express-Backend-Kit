import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Environment } from "../../utils/environment";

export const bucket_folder = ["images", "pdfs"] as const;

export const BUCKET_FOLDER_MAP = {
  images: "images",
  pdfs: "pdfs",
};

type BucketFolder = typeof bucket_folder[number];

const r2Client = new S3Client({
  region: "auto",
  endpoint: Environment.r2.endpoint,
  credentials: {
    accessKeyId: Environment.r2.access_key,
    secretAccessKey: Environment.r2.secret_access_key,
  },
});

const uploadFile = async (
  folder: BucketFolder,
  file: File,
  fileName: string
) => {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const key = `${BUCKET_FOLDER_MAP[folder]}/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: Environment.r2.bucket_name,
    Key: key,
    Body: buffer,
    ContentType: file.type || undefined,
  });

  await r2Client.send(command);

  return {
    key,
    url: `${Environment.r2.endpoint}/${key}`,
  };
};

const deleteFile = async (key: string) => {
  const command = new DeleteObjectCommand({
    Bucket: Environment.r2.bucket_name,
    Key: key,
  });

  await r2Client.send(command);

  return { deleted: true, key };
};

const listFiles = async (folder?: BucketFolder) => {
  const command = new ListObjectsV2Command({
    Bucket: Environment.r2.bucket_name,
    Prefix: folder ? `${folder}/` : undefined,
  });

  const result = await r2Client.send(command);

  return result.Contents?.map((obj) => ({
    key: obj.Key!,
    size: obj.Size,
    lastModified: obj.LastModified,
  })) || [];
};

const getSignedURL = async (key: string) => {
  const command = new GetObjectCommand({
    Bucket: Environment.r2.bucket_name,
    Key: key,
  });

  const signedUrl = await getSignedUrl(r2Client, command, {
    expiresIn: 60 * 60, // 1 hour
  });

  return signedUrl;
};

const doesRecordExist = async (key: string) => {
  const command = new HeadObjectCommand({
    Bucket: Environment.r2.bucket_name,
    Key: key,
  });

  try {
    await r2Client.send(command);
    return true;
  } catch (err: any) {
    if (err.$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
};

const getUploadSignedURL = async (
  folder: BucketFolder,
  fileName: string,
  contentType: string
) => {
  const key = `${BUCKET_FOLDER_MAP[folder]}/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: Environment.r2.bucket_name,
    Key: key,
    ContentType: contentType,
  });

  const signedUrl = await getSignedUrl(r2Client, command, {
    expiresIn: 60 * 20, // 10 minutes
  });

  return { signedUrl, key };
};

export const R2 = {
  uploadFile,
  deleteFile,
  listFiles,
  getSignedURL,
  getUploadSignedURL,
  doesRecordExist
};
