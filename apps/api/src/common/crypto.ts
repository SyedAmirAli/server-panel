import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "azm_live_";
const ENC_ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Generate a new plaintext API key + its short display prefix. */
export function generateApiKey(): { secret: string; prefix: string } {
  const random = randomBytes(24).toString("base64url");
  const secret = `${KEY_PREFIX}${random}`;
  return { secret, prefix: secret.slice(0, KEY_PREFIX.length + 6) };
}

const STORAGE_KEY_PREFIX = "azs_live_";

/** Generate a storage API key (distinct `azs_live_` prefix) + short display prefix. */
export function generateStorageKey(): { secret: string; prefix: string } {
  const random = randomBytes(24).toString("base64url");
  const secret = `${STORAGE_KEY_PREFIX}${random}`;
  return { secret, prefix: secret.slice(0, STORAGE_KEY_PREFIX.length + 6) };
}

const PUBLIC_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Generate a 12-char public bucket id (uppercase letters + digits). Unbiased sampling. */
export function generateBucketPublicId(length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PUBLIC_ID_ALPHABET[bytes[i] % PUBLIC_ID_ALPHABET.length];
  }
  return out;
}

/**
 * Deterministic keyed hash for indexed lookup on every /v1/send request.
 * HMAC-SHA256 (not argon2): keys are high-entropy, so a fast keyed hash is
 * safe and lets us query by hash directly.
 */
export function hashApiKey(secret: string, pepper: string): string {
  return createHmac("sha256", pepper).update(secret).digest("hex");
}

function encryptionKeyMaterial(key: string): Buffer {
  return createHash("sha256").update(key).digest();
}

/** AES-256-GCM encrypt for reversible secret storage (admin UI). */
export function encryptSecret(plaintext: string, encryptionKey: string): string {
  const key = encryptionKeyMaterial(encryptionKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ENC_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** Decrypt a value produced by {@link encryptSecret}. */
export function decryptSecret(ciphertext: string, encryptionKey: string): string {
  const key = encryptionKeyMaterial(encryptionKey);
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ENC_ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
