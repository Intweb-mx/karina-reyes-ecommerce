import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertSafeKey } from "./keys.ts";
import type { ObjectMetadata, SignedUrlOptions, StorageAdapter, StoredObject, UploadOptions } from "./types.ts";

export type S3StorageConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Endpoint del proveedor compatible (R2, MinIO, Spaces…); vacío = AWS. */
  endpoint?: string;
  forcePathStyle?: boolean;
  /** Base pública (dominio del bucket o CDN). Un bucket privado no la tiene: solo entrega URLs firmadas. */
  publicBaseUrl?: string;
};

/**
 * Almacenamiento compatible con S3. Sin proveedor fijo: bucket, endpoint,
 * región, claves y dominio llegan por variables de entorno.
 */
export class S3StorageAdapter implements StorageAdapter {
  readonly driver = "s3";
  private readonly client: S3Client;
  private readonly config: S3StorageConfig;

  // Sin "parameter properties": los scripts de operación corren con Node (strip-types), que no los soporta.
  constructor(config: S3StorageConfig) {
    this.config = config;
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
    return { key, url: this.config.publicBaseUrl ? this.getUrl(key) : "", size: body.byteLength, contentType: options.contentType };
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  getUrl(key: string): string {
    assertSafeKey(key);
    if (!this.config.publicBaseUrl) throw new Error("Este almacenamiento es privado: usa getSignedUrl.");
    return `${this.config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  async getSignedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    assertSafeKey(key);
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      // Con `downloadName` el navegador guarda el archivo; sin él lo reproduce o abre en línea.
      ResponseContentDisposition: options.downloadName ? `attachment; filename="${options.downloadName.replace(/[^\w.-]+/g, "_")}"` : undefined,
    });
    // El firmador y el cliente traen copias distintas de @smithy/types (solo difieren en tipos, no en ejecución).
    return getSignedUrl(this.client as unknown as Parameters<typeof getSignedUrl>[0], command as unknown as Parameters<typeof getSignedUrl>[1], { expiresIn: options.expiresInSeconds });
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
