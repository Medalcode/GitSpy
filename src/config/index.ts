import dotenv from 'dotenv'
dotenv.config()

export const config = {
  port: Number(process.env.PORT || 3000),
  env: process.env.NODE_ENV || 'development',
  githubToken: process.env.GITHUB_TOKEN || '',
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  queueName: process.env.QUEUE_NAME || 'events'
}
