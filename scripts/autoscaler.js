#!/usr/bin/env node
/**
 * Simple autoscaler logic (process-local) that polls metrics endpoints
 * and decides desired worker replicas based on backlog, latency, and
 * optional product signals (kanban JSON). It delegates actual scaling
 * to an adapter (k8s, script, noop).
 *
 * Config via env vars or CLI args.
 */

const http = require('http')
const https = require('https')
const fs = require('fs')
const url = require('url')
const { noopScaler, k8sScaler, scriptScaler } = require('./scale_adapters')

function parseArgs() {
  const args = process.argv.slice(2)
  const cfg = {}
  for (const a of args) {
    if (a.startsWith('--metrics=')) cfg.metrics = a.split('=')[1]
    if (a.startsWith('--poll=')) cfg.poll = Number(a.split('=')[1])
    if (a.startsWith('--min=')) cfg.min = Number(a.split('=')[1])
    if (a.startsWith('--max=')) cfg.max = Number(a.split('=')[1])
    if (a.startsWith('--target=')) cfg.target = Number(a.split('=')[1])
    if (a.startsWith('--kanban=')) cfg.kanban = a.split('=')[1]
    if (a.startsWith('--scaler=')) cfg.scaler = a.split('=')[1]
    if (a.startsWith('--k8s-deployment=')) cfg.k8sDeployment = a.split('=')[1]
    if (a.startsWith('--k8s-namespace=')) cfg.k8sNamespace = a.split('=')[1]
    if (a.startsWith('--scale-script=')) cfg.scaleScript = a.split('=')[1]
  }
  return cfg
}

const cfg = Object.assign({
  metrics: process.env.METRICS_URLS || 'http://localhost:3000/metrics/prom',
  poll: Number(process.env.SCALE_POLL_MS) || 15000,
  min: Number(process.env.SCALE_MIN) || 1,
  max: Number(process.env.SCALE_MAX) || 10,
  target: Number(process.env.TARGET_JOBS_PER_WORKER) || 50,
  kanban: process.env.KANBAN_JSON_PATH || '',
  scaler: process.env.SCALER || 'noop',
  k8sDeployment: process.env.K8S_DEPLOYMENT || '',
  k8sNamespace: process.env.K8S_NAMESPACE || '',
  scaleScript: process.env.SCALE_SCRIPT || ''
}, parseArgs())

const metricsUrls = cfg.metrics.split(',').map(s => s.trim()).filter(Boolean)

function fetchText(u) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(u)
    const get = parsed.protocol === 'https:' ? https.get : http.get
    const opts = Object.assign({}, parsed)
    get(opts, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function parsePromText(text) {
  const lines = text.split(/\r?\n/)
  const metrics = {}
  for (const l of lines) {
    if (!l || l.startsWith('#')) continue
    const parts = l.split(' ')
    const name = parts[0]
    const val = Number(parts.slice(1).join(' ').trim())
    if (!isNaN(val)) metrics[name] = val
  }
  return metrics
}

function aggregateMetrics(listOfMetrics) {
  const agg = {}
  for (const m of listOfMetrics) {
    for (const k of Object.keys(m)) {
      agg[k] = (agg[k] || 0) + m[k]
    }
  }
  return agg
}

// choose scaler
let scaler = null
if (cfg.scaler === 'k8s') scaler = k8sScaler({ deployment: cfg.k8sDeployment, namespace: cfg.k8sNamespace })
else if (cfg.scaler === 'script') scaler = scriptScaler({ script: cfg.scaleScript })
else scaler = noopScaler()

let currentReplicas = null
let lastScaleTime = 0
let consecutiveUps = 0
let consecutiveDowns = 0

async function checkOnce() {
  try {
    const texts = await Promise.all(metricsUrls.map(u => fetchText(u).catch(e => { console.warn('fetch metrics failed', u, e.message); return '' })))
    const parsed = texts.map(t => parsePromText(t))
    const agg = aggregateMetrics(parsed)

    const waiting = agg['gitspy_queue_waiting'] || 0
    const jobs_count = agg['gitspy_job_duration_ms_count'] || 0
    const jobs_sum = agg['gitspy_job_duration_ms_sum'] || 0
    const avgMs = jobs_count > 0 ? (jobs_sum / jobs_count) : 0

    // kanban signal
    let kanbanInProgress = 0
    try {
      if (cfg.kanban && fs.existsSync(cfg.kanban)) {
        const kb = JSON.parse(fs.readFileSync(cfg.kanban, 'utf8'))
        // kb may be object or array; accept both
        if (Array.isArray(kb)) {
          for (const b of kb) kanbanInProgress += (b.in_progress || 0)
        } else {
          // single board
          kanbanInProgress = (kb.in_progress && kb.in_progress.length) || 0
        }
      }
    } catch (e) { console.warn('kanban read failed', e.message) }

    // desired by backlog
    const desiredByBacklog = Math.max(cfg.min, Math.ceil(waiting / cfg.target) || cfg.min)
    // desired by latency: if avg > threshold, nudge up
    const desiredByLatency = avgMs > 2000 ? Math.max(desiredByBacklog, Math.ceil((avgMs / 2000))) : desiredByBacklog
    // desired by product signal: more in-progress => ensure at least ceil(in_progress/5)
    const desiredByKanban = kanbanInProgress > 0 ? Math.max(desiredByLatency, Math.ceil(kanbanInProgress / 5)) : desiredByLatency

    let desired = Math.min(cfg.max, Math.max(cfg.min, desiredByKanban))

    // apply hysteresis: require 2 consecutive checks to scale up, 3 to scale down
    currentReplicas = currentReplicas === null ? (await scaler.getCurrent().catch(() => null)) : currentReplicas
    if (currentReplicas === null) currentReplicas = cfg.min

    if (desired > currentReplicas) {
      consecutiveUps++
      consecutiveDowns = 0
    } else if (desired < currentReplicas) {
      consecutiveDowns++
      consecutiveUps = 0
    } else { consecutiveUps = 0; consecutiveDowns = 0 }

    const now = Date.now()
    const canScaleUp = consecutiveUps >= 2 && (now - lastScaleTime) > 60000
    const canScaleDown = consecutiveDowns >= 3 && (now - lastScaleTime) > 120000

    if (desired > currentReplicas && canScaleUp) {
      console.log('Scaling up from', currentReplicas, 'to', desired)
      await scaler.scaleTo(desired)
      currentReplicas = desired
      lastScaleTime = now
    } else if (desired < currentReplicas && canScaleDown) {
      console.log('Scaling down from', currentReplicas, 'to', desired)
      await scaler.scaleTo(desired)
      currentReplicas = desired
      lastScaleTime = now
    } else {
      console.log('No scale change. desired=', desired, 'current=', currentReplicas, 'waiting=', waiting, 'avgMs=', Math.round(avgMs), 'kanbanInProgress=', kanbanInProgress)
    }
  } catch (e) {
    console.error('autoscaler check failed', e)
  }
}

async function main() {
  console.log('Autoscaler starting with config', Object.assign({}, cfg, { metrics: metricsUrls }))
  // initial probe
  await checkOnce()
  setInterval(checkOnce, cfg.poll)
}

main().catch(e => { console.error(e); process.exit(1) })
