import client from 'prom-client'

// Central Prometheus registry for this process. Each process (server, worker)
// will create its own registry instance via this module so they can be scraped
// independently in a distributed deployment.
const register = new client.Registry()
client.collectDefaultMetrics({ register })

// Counters
export const eventsReceived = new client.Counter({
  name: 'gitspy_events_received_total',
  help: 'Total number of events received by the HTTP ingress',
  labelNames: ['event_type'],
  registers: [register]
})

export const jobsProcessed = new client.Counter({
  name: 'gitspy_jobs_processed_total',
  help: 'Total number of jobs processed successfully',
  labelNames: ['event_type'],
  registers: [register]
})

export const jobsFailed = new client.Counter({
  name: 'gitspy_jobs_failed_total',
  help: 'Total number of jobs failed',
  labelNames: ['event_type'],
  registers: [register]
})

export const jobsRetried = new client.Counter({
  name: 'gitspy_jobs_retried_total',
  help: 'Total number of job retries attempted',
  labelNames: ['event_type'],
  registers: [register]
})

// Histogram for job durations in milliseconds
export const jobDurationMs = new client.Histogram({
  name: 'gitspy_job_duration_ms',
  help: 'Duration of job processing in milliseconds',
  labelNames: ['event_type'],
  buckets: [50, 100, 250, 500, 1000, 2000, 5000, 10000],
  registers: [register]
})

// Gauges for queue sizes are updated by the metrics route (which queries
// BullMQ). We also export a registry and a helper to expose metrics.
export function getRegister() {
  return register
}

export default {
  register,
  eventsReceived,
  jobsProcessed,
  jobsFailed,
  jobsRetried,
  jobDurationMs,
  getRegister
}
