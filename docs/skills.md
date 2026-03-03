# Skills

Documento de referencia de *skills* (capacidades) implementadas por GitSpy y cómo se componen en agentes.

Cada skill incluye: propósito, inputs, outputs, idempotencia/retries y los archivos/símbolos relacionados.

## EventLifecycleSkill(stage)
- **Propósito**: Gestionar el flujo de vida de un evento desde la recepción hasta la ejecución.
- **Param Stage**:
  - `ingestion`: Valida y encola el webhook en BullMQ (`src/infra/queue.ts`).
  - `execution`: Procesa el job desde la cola y coordina actualizaciones (`src/workers/eventWorker.ts`).
- **Idempotencia**: Deduplicación basada en `event_id` en Redis.

## ResourceSyncSkill(type, mode)
- **Propósito**: Sincroniza metadatos de recursos (ej. repositorios) entre GitHub y la base de datos local.
- **Param Type**: `repository`.
- **Param Mode**:
  - `remote`: Consulta la API de GitHub respetando rate limits (`src/infra/githubAdapter.ts`).
  - `local`: Actualiza o inserta en SQLite/Postgres (`src/infra/db.ts`).
- **Reutilización**: Fusiona `FetchFromGitHub` y `PersistRepository` en una única transacción lógica de "Sincronización".

## InfraControlSkill(action, target)
- **Propósito**: Ejecuta operaciones de bajo nivel en la infraestructura.
- **Param Action**: `invalidate`, `flush`, `stats`.
- **Param Target**: `cache` (Redis), `queue` (BullMQ).
- **Código**: `delCache` y `delByPattern` en `src/infra/cache.ts`.


## Observabilidad y métricas
- Recomendación: instrumentar `EventWorker` para contar jobs procesados, fallos y latencias mediante `prom-client`. Ya existe endpoint `/metrics` en [src/routes/metrics.ts](src/routes/metrics.ts).

## Runbooks cortos por skill
- `FetchRepositoryFromGitHub`: en caso de ratelimit prolongado, revisar tokens y aplicar backoff; considerar cache de respuesta durante ventana de ratelimit.
- `ProcessEventJob`: en caso de backlog alto, aumentar réplicas `worker` y revisar Redis throughput.
