/**
 * S3-compatible file storage helpers.
 * Supports Cloudflare R2, AWS S3, or any S3-compatible service.
 * Set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_PUBLIC_URL in env.
 */
import { ENV } from "./_core/env";
import { getLocalUploadsDir } from "./db";
import fs from "node:fs/promises";
import path from "node:path";

function useS3Storage() {
  return ENV.storageMode === "s3";
}

function encodeFileKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function resolveLocalFilePath(key: string) {
  const uploadDir = path.resolve(getLocalUploadsDir());
  const filePath = path.resolve(uploadDir, key);
  if (!filePath.startsWith(uploadDir + path.sep) && filePath !== uploadDir) {
    throw new Error("Invalid file key");
  }
  return filePath;
}

export async function storagePut(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  if (!useS3Storage()) {
    const filePath = resolveLocalFilePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const body = typeof data === "string" ? Buffer.from(data) : data;
    await fs.writeFile(filePath, body);
    return { key, url: `/api/files/${encodeFileKey(key)}` };
  }

  const { s3Endpoint, s3AccessKeyId, s3SecretAccessKey, s3Bucket, s3PublicUrl } = ENV;

  if (!s3Endpoint || !s3AccessKeyId || !s3SecretAccessKey || !s3Bucket) {
    throw new Error(
      "S3 storage not configured. Set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET in environment variables."
    );
  }

  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      endpoint: s3Endpoint,
      region: "auto",
      credentials: {
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
      },
      forcePathStyle: true,
    });
    const body = typeof data === "string" ? Buffer.from(data) : data;
    await client.send(new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
    const publicBase = s3PublicUrl || s3Endpoint + "/" + s3Bucket;
    const url = publicBase.replace(/\/$/, "") + "/" + key;
    return { key, url };
  } catch (importError) {
    throw new Error(
      "S3 upload failed. Install @aws-sdk/client-s3: pnpm add @aws-sdk/client-s3. Error: " + importError
    );
  }
}

export async function storageGet(
  key: string
): Promise<{ key: string; url: string }> {
  if (!useS3Storage()) {
    return { key, url: `/api/files/${encodeFileKey(key)}` };
  }

  const { s3PublicUrl, s3Bucket, s3Endpoint } = ENV;
  const publicBase = s3PublicUrl || s3Endpoint + "/" + s3Bucket;
  const url = publicBase.replace(/\/$/, "") + "/" + key;
  return { key, url };
}
/**
 * Delete a file from S3-compatible storage.
 */
export async function storageDelete(key: string): Promise<void> {
  if (!useS3Storage()) {
    await fs.rm(resolveLocalFilePath(key), { force: true });
    return;
  }

  const { s3Endpoint, s3AccessKeyId, s3SecretAccessKey, s3Bucket } = ENV;

  if (!s3Endpoint || !s3AccessKeyId || !s3SecretAccessKey || !s3Bucket) {
    throw new Error(
      "S3 storage not configured. Set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET env vars."
    );
  }

  try {
    const { S3Client, DeleteObjectCommand } = await import(
      "@aws-sdk/client-s3"
    );
    const client = new S3Client({
      endpoint: s3Endpoint,
      region: "auto",
      credentials: {
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
      },
      forcePathStyle: true,
    });

    await client.send(
      new DeleteObjectCommand({
        Bucket: s3Bucket,
        Key: key,
      })
    );
  } catch (importError) {
    throw new Error(
      "S3 delete failed. Install @aws-sdk/client-s3: pnpm add @aws-sdk/client-s3. Error: " +
        importError
    );
  }
}
