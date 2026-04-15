/**
 * S3-compatible file storage helpers.
 * Supports Cloudflare R2, AWS S3, or any S3-compatible service.
 * Set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_PUBLIC_URL in env.
 */
import { ENV } from "./_core/env";

export async function storagePut(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
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
  const { s3PublicUrl, s3Bucket, s3Endpoint } = ENV;
  const publicBase = s3PublicUrl || s3Endpoint + "/" + s3Bucket;
  const url = publicBase.replace(/\/$/, "") + "/" + key;
  return { key, url };
}
/**
 * Delete a file from S3-compatible storage.
 */
export async function storageDelete(key: string): Promise<void> {
  const { s3Endpoint, s3AccessKeyId, s3SecretAccessKey, s3BucketName } = ENV;

  if (!s3Endpoint || !s3AccessKeyId || !s3SecretAccessKey) {
    throw new Error(
      "S3 storage not configured. Set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME env vars."
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
        Bucket: s3BucketName,
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
