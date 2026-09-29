import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { assertSafeKey } from "./keys.ts";
import type { ObjectMetadata, StorageAdapter, StoredObject, UploadOptions } from "./types.ts";

export type S3StorageConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Endpoint del proveedor compatible (R2, MinIO, Spaces…); vacío = AWS. */
  endpoint?: string;
  forcePathStyle?: boolean;
  /** Base pública (dominio del bucket o CDN). */
  publicBaseUrl: string;
};

/**
 * Almacenamiento compatible con S3. Sin proveedor fijo: bucket, endpoint,
 * región, claves y dominio llegan por variables de entorno.
 */
export class S3StorageAdapter implements StorageAdapter {
  readonly driver = "s3";
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async upload(key: string, body: Uint8Array, options: UploadOptions): Promise<StoredObject> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        // Las claves son únicas por versión: el archivo nunca cambia bajo la misma URL.
        CacheControl: options.cacheControl ?? "public, max-age=31536000, immutable",
      }),
    );
    return { key, url: this.getUrl(key), size: body.byteLength, contentType: options.contentType };
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  getUrl(key: string): string {
    assertSafeKey(key);
    return `${this.config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.getMetadata(key)) !== null;
  }

  async getMetadata(key: string): Promise<ObjectMetadata | null> {
    assertSafeKey(key);
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return { key, size: head.ContentLength ?? 0, contentType: head.ContentType ?? null, lastModified: head.LastModified ?? null };
    } catch (error) {
      if (error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey")) return null;
      throw error;
    }
  }
}
