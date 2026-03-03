# Agents

Este documento describe los "agents" operativos del proyecto GitSpy: procesos desplegables que ejecutan responsabilidades separadas y escalables.

## Resumen de agentes

- **Agente Generalista (ops-agent)**: proceso unificado (o coordinado) que gestiona tanto la ingesta de webhooks (`api`) como la ejecución de procesos en segundo plano (`worker`).
  - **Rol Ingesta**: Expone endpoints HTTP y encola eventos.
  - **Rol Ejecución**: Consume la cola BullMQ y ejecuta la lógica de sincronización.
  Archivo principal: [src/index.ts](src/index.ts#L1); Lógica coordinada en: [src/workers/eventWorker.ts](src/workers/eventWorker.ts).

## Responsabilidades y boundaries

- **GitSpy Generalist Agent**:
  - Gestión de Ciclo de Vida: Desde la recepción del webhook hasta la persistencia final.
  - Sincronización de Recursos: Consulta a GitHub API y actualización de DB/Cache.
  - Observabilidad: Exposición de métricas agregadas y estados de salud.


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
