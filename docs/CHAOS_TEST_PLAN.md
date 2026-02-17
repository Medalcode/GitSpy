# Chaos / Failure Testing Plan for GitSpy

Objetivo
- Validar resiliencia y recuperación del sistema GitSpy (HTTP server + workers + Redis).
- Simular fallos: Redis down, worker crashes, eventos duplicados y replays parciales.
- Definir criterios de éxito, métricas a observar, y pasos reproducibles.

Alcance
- Entorno local o staging con: Redis, HTTP server (app), Worker(s).
- Prometheus/Grafana opcional para observabilidad; si no disponible, usar `/metrics/prom` endpoints y Redis introspection.

Prerequisitos
- Node >= 18
- Docker (para levantar/parar Redis) o un servicio Redis accesible
- Dependencias del proyecto instaladas: `npm ci` (para ejecutar scripts Node)
- El proyecto corriendo: `npm run dev` (server) y `npm run start:worker` (worker) en procesos separados

Arquitectura a probar
- HTTP server (Express) expone `/webhooks` y `/metrics/prom`
- Workers corriendo en proceso(s) separados, exponen `/metrics/prom` en `WORKER_METRICS_PORT`
- Redis (BullMQ) como broker + cache + dedupe storage

Métricas clave (a observar)
- gitspy_events_received_total (counter)
- gitspy_jobs_processed_total (counter)
- gitspy_jobs_failed_total (counter)
- gitspy_jobs_retried_total (counter)
- gitspy_job_duration_ms (histogram)
- gitspy_queue_waiting, gitspy_queue_active (gauges via /metrics/prom)
- Redis key counts: `SCAN` pattern `events:*:state` (cardinality)

PromQL ejemplos
- Eventos por minuto: `rate(gitspy_events_received_total[1m])`
- Jobs procesados por minuto: `rate(gitspy_jobs_processed_total[1m])`
- Fallas: `rate(gitspy_jobs_failed_total[5m])`
- P95 latencia de jobs: `histogram_quantile(0.95, sum(rate(gitspy_job_duration_ms_bucket[5m])) by (le))`
- Backlog: `gitspy_queue_waiting` (valor instantáneo)

Escenarios y pasos (ordenados)

1) Baseline (01-smoke)
- Objetivo: confirmar estado sano antes de chaos.
- Pasos:
  - Levantar Redis (docker run -d --name gitspy-redis -p6379:6379 redis:7-alpine)
  - Levantar server: `npm run dev`
  - Levantar worker: `npm run start:worker` (en otra terminal)
  - Enviar 20 webhooks de prueba (scripts/chaos/send_duplicate_webhooks.sh con count=20)
- Expectativa / Criterios de éxito:
  - `gitspy_events_received_total` aumenta ~20
  - `gitspy_jobs_processed_total` aumenta ~20
  - `gitspy_queue_waiting` ~0 after processing
  - job duration P95 reasonable (< a threshold configurable)

2) Redis Down (02-redis-down)
- Objetivo: validar comportamiento cuando Redis no está disponible.
- Pasos:
  - Confirm baseline.
  - Stop Redis container: `docker stop gitspy-redis` (or simulate network partition)
  - Mientras Redis está down, enviar 10 webhooks.
  - Observar server and worker behavior (HTTP should still respond; enqueue should fail and return 500 or buffered behavior depending on config).
  - Start Redis: `docker start gitspy-redis`
  - Observe recovery: queued events should be enqueued and processed.
- Expected metrics & success criteria:
  - During outage: `gitspy_events_received_total` may increase if server accepts, but `gitspy_queue_waiting` cannot be updated (queue ops fail). Server should return 5xx for enqueue attempts (documented behavior). No silent acceptance without persistent storage.
  - After Redis up: worker processes previously failed events (jobs retried or re-enqueued). `gitspy_jobs_processed_total` eventually catches up to expected count within X minutes.
  - No lost events: all sent events reach `processed` state (inspect Redis keys `events:<id>:state==processed` or DB entries).

3) Worker Crash and Auto-recovery (03-worker-crash)
- Objective: ensure worker crash doesn't lose jobs and system recovers when worker restarts.
- Steps:
  - Baseline with few events in queue.
  - Kill worker process (simulate crash): `pkill -f src/worker.ts` or `kill <pid>`.
  - While worker down, send 50 webhooks.
  - Restart worker: `npm run start:worker`.
  - Observe: worker should pick up backlog and process jobs.
- Success criteria:
  - No duplicates in processed state (check `events:*:state` and DB upserts counts).
  - Jobs retried as per attempts; final processed count equals sent events.
  - Metrics: backlog (waiting) increases while worker is down and decreases after restart.

4) Duplicate Events (04-duplicates)
- Objective: validate idempotence — duplicates don't create duplicate side-effects.
- Steps:
  - Pick a test event payload (use `scripts/chaos/send_duplicate_webhooks.sh --count 5 --same`).
  - Send same event (same `x-github-delivery` or identical payload) N times.
  - Observe worker and final DB state.
- Expected outcomes:
  - Only one processed effect persisted (e.g., single upsert result).
  - Redis `events:<id>:state` reflects `processed` and only one processing occurred (lock prevented concurrency).

5) Partial Replay (05-replay)
- Objective: run `scripts/replay_events.js` in dry-run and live, ensure deterministic reconstruction and idempotence.
- Steps:
  - Run dry-run for a time window: `node scripts/replay_events.js --from=... --to=... --dry-run`
  - Inspect outputs in `replay-output` if live run.
  - Run overlapping partial replay twice and ensure deterministic final board.
- Success criteria:
  - Replaying same events multiple times yields same final Kanban JSON.
  - No duplicate cards or conflicting states after repeated replays.

6) Combined Chaos (06-combined)
- Objective: simulate Redis flapping + worker restarts + duplicate events concurrently.
- Steps:
  - Start a background script that toggles Redis (stop/start every 30s) for 5 minutes.
  - Simultaneously flood with webhooks and restart workers intermittently.
- Success criteria:
  - System eventually converges: all events marked `processed` and DB state consistent.
  - Metrics show retries but not unbounded failures.

Failure modes to detect
- Lost events (sent but never processed).
- Duplicate side-effects (non-idempotent handler logic).
- Locks stuck permanently (monitor `events:*:lock` keys not expiring).
- Backlog not shrinking after system recovery.

Metrics to collect for validation
- Counters: events_received, jobs_processed, jobs_failed, jobs_retried
- Histogram: job_duration_ms (P50/P95)
- Gauges: queue_waiting, queue_active
- Redis key counts: `redis-cli --scan --pattern 'events:*:state' | wc -l`

Playbook for validation
1. Run scenario, collect start timestamp.
2. During scenario, poll `/metrics/prom` on server and worker(s) every 10s.
3. After scenario, compute:
   - sent = number of HTTP requests sent
   - processed = increase in `gitspy_jobs_processed_total`
   - failed = increase in `gitspy_jobs_failed_total`
   - retried = increase in `gitspy_jobs_retried_total`
4. Success if processed == sent and failed is within expected tolerance (0 for ideal), and backlog returns to near-zero.

Automation scripts
Small helper scripts added under `scripts/chaos/`:
- `send_duplicate_webhooks.sh` - send floods and duplicates
- `simulate_redis_down.sh` - stop/start redis container by name `gitspy-redis`
- `simulate_worker_crash.sh` - kill worker process by pattern
- `run_partial_replay.sh` - runs the replay script with time window

Safety notes
- Use staging environment, not production.
- Scripts perform destructive actions (stop containers, kill processes). Review before running.

Next steps
- Execute each scenario in a controlled staging environment.
- Record logs and metrics snapshots; iterate TTL and lockTtl values if locks expire too soon.
- Add automated CI job for smoke chaos testing on merge to main branch (optional).

*** End of Plan ***
