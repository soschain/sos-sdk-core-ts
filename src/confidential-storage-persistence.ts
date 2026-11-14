import { CONFIDENTIAL_JWE_BLOB_CONTENT_TYPE, type ConfidentialBlobInfo, type ConfidentialStorageDoc } from 'sos-data-utils-ts/confidential-storage'
import { stripUndefinedDeep } from 'sos-data-utils-ts/json-projection'

export { CONFIDENTIAL_JWE_BLOB_CONTENT_TYPE }
export interface ConfidentialBlobWriter {
  provider?: string
  put(dataBytes: Uint8Array, contentType: string): Promise<ConfidentialBlobInfo>
}
export interface ConfidentialBlobReader {
  get(blobRef: string): Promise<{ dataBytes: Uint8Array; contentType?: string }>
  delete?(blobRef: string): Promise<void>
}
export interface ConfidentialBlobStore extends ConfidentialBlobWriter, ConfidentialBlobReader {}
/** Minimal record shape only; resource validation and authorization remain with the caller. */
export type ConfidentialStorageDocRecord = Pick<ConfidentialStorageDoc, 'id' | 'sequence'> & Partial<ConfidentialStorageDoc>
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
export function isConfidentialStorageDocRecord(value: unknown): value is ConfidentialStorageDocRecord {
  return isRecord(value) && typeof value.id === 'string' && typeof value.sequence === 'number'
}

/** Externalize opaque encrypted JSON through the explicit port; source records remain untouched on success or failure. */
export async function externalizeConfidentialStorageDocForPersistence<T>(document: T, writer?: ConfidentialBlobWriter): Promise<T> {
  if (!writer || !isConfidentialStorageDocRecord(document) || !document.jwe) return stripUndefinedDeep(document)
  if (!isRecord(document.jwe)) throw new TypeError('Confidential envelope must be a JSON object.')
  const bytes = new TextEncoder().encode(JSON.stringify(document.jwe))
  const blob = await writer.put(bytes, CONFIDENTIAL_JWE_BLOB_CONTENT_TYPE)
  if (typeof blob?.blobRef !== 'string' || !blob.blobRef.trim()) throw new TypeError('Confidential blob reference is required.')
  const persisted = { ...document, blob: {
    blobRef: blob.blobRef,
    provider: blob.provider || writer.provider,
    locator: blob.locator,
    contentType: blob.contentType || CONFIDENTIAL_JWE_BLOB_CONTENT_TYPE,
  } }
  delete persisted.jwe
  return stripUndefinedDeep(persisted)
}

/** Hydrate encrypted JSON only. Cryptographic verification/decryption remains with the authenticated runtime. */
export async function hydrateConfidentialStorageDocFromPersistence<T>(document: T, reader?: ConfidentialBlobReader): Promise<T> {
  if (!reader || !isConfidentialStorageDocRecord(document) || document.jwe || !document.blob?.blobRef) return document
  const stored = await reader.get(document.blob.blobRef)
  const jwe: unknown = JSON.parse(new TextDecoder().decode(stored.dataBytes))
  if (!isRecord(jwe)) throw new TypeError('Stored confidential envelope must be a JSON object.')
  return { ...document, jwe }
}
