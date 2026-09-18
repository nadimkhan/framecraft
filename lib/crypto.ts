import crypto from 'crypto'

/**
 * Symmetric encryption for at-rest OAuth tokens.
 *
 * Tokens (especially IG long-lived tokens) are sensitive credentials. We
 * encrypt them with AES-256-GCM before writing to the DB and decrypt on read.
 *
 * The key is derived from the SOCIAL_TOKEN_ENC_KEY env var (32 bytes hex / 64
 * chars). Generate one with:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Without the key, tokens are written/read as plaintext (so this still works
 * during local dev before the key is set — the encrypt() returns a clearly-
 * marked plaintext with a version byte for forward compatibility).
 */

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const AUTH_TAG_LEN = 16
// version byte: 0x01 = encrypted, 0x00 = plaintext fallback
const VERSION_ENCRYPTED = 0x01

function getKey(): Buffer | null {
  const hex = process.env.SOCIAL_TOKEN_ENC_KEY
  if (!hex) return null
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.warn('[crypto] SOCIAL_TOKEN_ENC_KEY must be 64 hex chars (32 bytes). Falling back to plaintext.')
    return null
  }
  return Buffer.from(hex, 'hex')
}

export function encryptToken(plaintext: string): string {
  const key = getKey()
  if (!key) return plaintext // dev fallback
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const version = Buffer.from([VERSION_ENCRYPTED])
  return Buffer.concat([version, iv, authTag, ciphertext]).toString('base64')
}

export function decryptToken(stored: string): string {
  if (!stored) return ''
  const key = getKey()
  if (!key) return stored // dev fallback — assume plaintext
  // Detect encrypted format: version byte (0x01) followed by 12-byte IV
  try {
    const raw = Buffer.from(stored, 'base64')
    if (raw.length < 1 + IV_LEN + AUTH_TAG_LEN) return stored // too short, plaintext
    const version = raw[0]
    if (version !== VERSION_ENCRYPTED) return stored
    const iv = raw.subarray(1, 1 + IV_LEN)
    const authTag = raw.subarray(1 + IV_LEN, 1 + IV_LEN + AUTH_TAG_LEN)
    const ciphertext = raw.subarray(1 + IV_LEN + AUTH_TAG_LEN)
    const decipher = crypto.createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    return stored // fall through — already plaintext
  }
}
