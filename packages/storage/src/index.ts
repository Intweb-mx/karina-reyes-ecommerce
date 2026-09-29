import { LocalStorageAdapter } from "./local.ts";
import { S3StorageAdapter } from "./s3.ts";
import type { StorageAdapter } from "./types.ts";
import { LOCAL_MEDIA_PREFIX, localStorageDir, storageDriver } from "./url.ts";

export { createUrlResolver, LOCAL_MEDIA_PREFIX, localStorageDir, storageDriver, type StorageDriver } from "./url.ts";

export { contentTypeByExtension, contentTypeFor } from "./content-types.ts";
export { assertSafeKey, createObjectKey, slugifyFilename } from "./keys.ts";
export { findRepoRoot, LocalStorageAdapter } from "./local.ts";
export { S3StorageAdapter, type S3StorageConfig } from "./s3.ts";
export {
  cleanOriginalFilename,
  detectFileType,
  MAX_IMAGE_DIMENSION,
  MAX_UPLOAD_BYTES,
  validateUpload,
  type DetectedFile,
  type MediaKind,
  type ValidatedFile,
  type ValidationResult,
} from "./validation.ts";
export type { ObjectMetadata, ReadableStorage, StorageAdapter, StoredObject, UploadOptions } from "./types.ts";

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name} para el almacenamiento.`);
  return value;
}

/** Crea el adaptador según STORAGE_DRIVER (local | s3). Requiere credenciales para s3. */
export function createStorage(env: Env = process.env): StorageAdapter {
  if (storageDriver(env) === "s3") {
    return new S3StorageAdapter({
      bucket: required(env, "STORAGE_BUCKET"),
      region: env.STORAGE_REGION || "auto",
      accessKeyId: required(env, "STORAGE_ACCESS_KEY"),
      secretAccessKey: required(env, "STORAGE_SECRET_KEY"),
      endpoint: env.STORAGE_ENDPOINT || undefined,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === "true",
      publicBaseUrl: required(env, "STORAGE_PUBLIC_URL"),
    });
  }
  return new LocalStorageAdapter(localStorageDir(env), LOCAL_MEDIA_PREFIX);
}
