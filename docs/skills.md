# Skills

Documento de referencia de *skills* (capacidades) implementadas por GitSpy y cómo se componen en agentes.

Cada skill incluye: propósito, inputs, outputs, idempotencia/retries y los archivos/símbolos relacionados.

## ProcessWebhookEvent
- Propósito: Convertir una petición webhook en un job en la cola.
- Input: payload del webhook (objeto JSON).
- Output: job encolado (`github:event`).
- Idempotencia: deduplicación debe manejarse a nivel de consumidor si es necesario.
- Código: `enqueueEvent` en [src/infra/queue.ts](src/infra/queue.ts).

## ProcessEventJob
- Propósito: Lógica principal que procesa eventos en la cola.
- Input: job.data (evento GitHub).
- Output: actualizaciones en DB, invalida cache, llamadas a GitHub si procede.
- Retries: gestionado por BullMQ; `EventWorker` re-lanza errores cuando sean fatales.
- Código: `EventWorker` en [src/workers/eventWorker.ts](src/workers/eventWorker.ts).

## FetchRepositoryFromGitHub
- Propósito: Obtener datos actualizados de un repositorio usando la API de GitHub respetando rate limits.
- Input: owner, repo.
- Output: objeto de repositorio o `null`.
- Rate-limiting: controlado por `requestWithRateLimit`, `waitForAllowance`, `backoffUntilReset`.
- Código: `fetchRepo`, `getOctokit` en [src/infra/githubAdapter.ts](src/infra/githubAdapter.ts).

## CacheInvalidate
- Propósito: Borrar claves de cache por patrón o exactas tras eventos relevantes.
- Input: key o pattern.
- Output: operaciones `DEL` en Redis.
- Código: `delCache`, `delByPattern` en [src/infra/cache.ts](src/infra/cache.ts).

## PersistRepository
- Propósito: Guardar/upsert de metadatos de repositorio en la base de datos.
- Input: objeto repo desde GitHub.
- Output: fila en `repositories`.
- Código: `saveRepositoryFromGitHub` (core) y `upsertRepository` en [src/infra/db.ts](src/infra/db.ts).

## Observabilidad y métricas
- Recomendación: instrumentar `EventWorker` para contar jobs procesados, fallos y latencias mediante `prom-client`. Ya existe endpoint `/metrics` en [src/routes/metrics.ts](src/routes/metrics.ts).

## Runbooks cortos por skill
- `FetchRepositoryFromGitHub`: en caso de ratelimit prolongado, revisar tokens y aplicar backoff; considerar cache de respuesta durante ventana de ratelimit.
- `ProcessEventJob`: en caso de backlog alto, aumentar réplicas `worker` y revisar Redis throughput.
