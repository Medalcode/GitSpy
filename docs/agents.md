# Agents

Este documento describe los "agents" operativos del proyecto GitSpy: procesos desplegables que ejecutan responsabilidades separadas y escalables.

## Resumen de agentes

- **API (api)**: servidor HTTP Express que expone endpoints (`/repositories`, `/webhooks`, `/metrics`, `/health`, `/readyz`). Archivo principal: [src/index.ts](src/index.ts#L1).
- **Worker (worker)**: proceso que ejecuta los trabajadores de BullMQ para procesar eventos encolados. Lógica de jobs: [src/workers/eventWorker.ts](src/workers/eventWorker.ts). Runner sugerido: [src/worker-runner.ts](src/worker-runner.ts).

## Responsabilidades y boundaries

- **API**:
  - Recibir webhooks y encolar eventos (`enqueueEvent` en [src/infra/queue.ts](src/infra/queue.ts#L1)).
  - Servir consultas de lectura hacia la base de datos y cache.
  - Exponer métricas y endpoints de salud/readiness.

- **Worker**:
  - Procesar jobs de la cola `events` con `EventWorker`.
  - Invalidar cache (`src/infra/cache.ts`) y persistir datos (`src/infra/db.ts`).
  - Consumir la API de GitHub respetando límites (`src/infra/githubAdapter.ts`).

## Despliegue y escalado

- Desplegar `api` y `worker` como Deployments separados. Escalar horizontalmente el `api` y el `worker` de forma independiente.
- Mantener BullMQ + Redis como broker compartido; configurar `REDIS_URL` por entorno/Secret.
- Probes Kubernetes recomendadas:
  - `livenessProbe` -> `GET /health`
  - `readinessProbe` -> `GET /readyz` (verifica Redis y capacidad de encolar)

## Runbooks (rápido)

- Si backlog de la cola crece: escalar réplicas del `worker` o aumentar paralelismo configurable.
- Si Redis falla: reiniciar Redis; setear alertas sobre `queue_depth` y aplicar failover si es necesario.

## Referencias importantes

- Queue/Worker: [src/infra/queue.ts](src/infra/queue.ts)
- Job processor: [src/workers/eventWorker.ts](src/workers/eventWorker.ts)
- GitHub adapter + rate limiter: [src/infra/githubAdapter.ts](src/infra/githubAdapter.ts) y [src/infra/rateLimiter.ts](src/infra/rateLimiter.ts)
