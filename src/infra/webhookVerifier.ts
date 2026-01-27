import crypto from 'crypto'

export function verifySignature(secret: string, body: string, signature: string | undefined) {
  if (!secret) return true // if not configured, skip (dev)
  if (!signature) return false

  // Expect signature in format: sha256=<hex>
  if (typeof signature !== 'string' || !signature.startsWith('sha256=')) return false

  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(body)
  const digestHex = hmac.digest('hex')

  // Convert both to buffers of the raw bytes and compare length first
  const sigHex = signature.slice('sha256='.length)
  if (sigHex.length !== digestHex.length) return false
  const digestBuf = Buffer.from(digestHex, 'hex')
  const sigBuf = Buffer.from(sigHex, 'hex')
  if (digestBuf.length !== sigBuf.length) return false

  return crypto.timingSafeEqual(digestBuf, sigBuf)
}

export function parseWebhookPayload(body: string) {
  if (!body || body.length === 0) return null
  try {
    return JSON.parse(body)
  } catch (_) {
    return body
  }
}
