export type UploadOptions = {
  contentType: string;
  cacheControl?: string;
};

export type StoredObject = {
  key: string;
  url: string;
  size: number;
  contentType: string;
};

export type ObjectMetadata = {
  key: string;
  size: number;
  contentType: string | null;
  lastModified: Date | null;
};

/**
 * Contrato de almacenamiento de archivos (imágenes, PDFs). El CMS solo
 * depende de esta interfaz; el proveedor se elige por variables de
 * entorno (STORAGE_DRIVER) sin tocar la lógica de contenido.
 */
export interface StorageAdapter {
  readonly driver: string;
  upload(key: string, body: Uint8Array, options: UploadOptions): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  /** URL pública estable del objeto. */
  getUrl(key: string): string;
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<ObjectMetadata | null>;
}

/** Solo el almacenamiento local sirve archivos a través de la app. */
export interface ReadableStorage extends StorageAdapter {
  read(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
}
