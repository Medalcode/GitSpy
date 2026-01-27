const Redis = require('ioredis')
const crypto = require('crypto')

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3000/webhooks'
const secret = process.env.GITHUB_WEBHOOK_SECRET || ''

const redis = new Redis(redisUrl)

async function scanKeys(pattern) {
  return new Promise((resolve, reject) => {
    const found = []
    const stream = redis.scanStream({ match: pattern, count: 100 })
    stream.on('data', (keys) => {
      for (const k of keys) found.push(k)
    })
    stream.on('end', () => resolve(found))
    stream.on('error', (e) => reject(e))
  })
}

async function showKeys(title) {
  console.log('---', title, '---')
  const keys = await scanKeys('repositories*')
  if (keys.length === 0) {
    console.log('(no repository keys)')
  } else {
    for (const k of keys) {
      const v = await redis.get(k)
      console.log(k, '=>', v && v.substring(0, 200))
    }
  }
}

async function sendWebhook(payload) {
  const body = JSON.stringify(payload)
  let sig = ''
  if (secret) {
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(body)
    sig = 'sha256=' + hmac.digest('hex')
  }

  const headers = {
    'content-type': 'application/json',
    'x-github-event': 'push'
  }
  if (sig) headers['x-hub-signature-256'] = sig

  const res = await fetch(webhookUrl, { method: 'POST', body, headers })
  const text = await res.text()
  console.log('Webhook response:', res.status, text)
}

async function main() {
  try {
    // Prepare keys
    await redis.set('repositories:owner/repo', JSON.stringify({ from: 'cache', value: 1 }), 'EX', 600)
    await redis.set('repositories:page:1:per:20', JSON.stringify({ data: [1] }), 'EX', 600)
    await redis.set('repositories:owner/repo:extra', 'x', 'EX', 600)

    await showKeys('Before webhook')

    const payload = {
      repository: { full_name: 'owner/repo', name: 'repo', owner: { login: 'owner' } },
      ref: 'refs/heads/main'
    }

    await sendWebhook(payload)

    // wait a short while for worker to process
    await new Promise((r) => setTimeout(r, 2500))

    await showKeys('After webhook')
  } catch (e) {
    console.error(e)
  } finally {
    redis.disconnect()
  }
}

main()
