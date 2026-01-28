# GitSpy

API intermedia que centraliza y optimiza llamadas a GitHub con sistema de caché, cola de eventos y rate limiting inteligente.

## 🚀 Quick Start

### Instalación

```bash
# Instalar dependencias
npm install

# Copiar configuración de ejemplo
cp .env.example .env

# Ejecutar en modo desarrollo
npm run dev
```

### Configuración

Edita `.env` con tus credenciales:

```env
PORT=3000
GITHUB_TOKEN=your_github_token_here
GITHUB_WEBHOOK_SECRET=your_webhook_secret
REDIS_URL=redis://localhost:6379
QUEUE_NAME=events
```

## 📋 Características

### Core Features

- **Servidor Express** con rutas `/webhooks`, `/repositories` y `/metrics`
- **GitHub Integration** con adaptador Octokit y rate limiting inteligente
- **Sistema de Caché** con Redis (get/set/del/pattern matching)
- **Cola de Eventos** con BullMQ para procesamiento asíncrono
- **Validación HMAC** para webhooks de GitHub (timing-safe)
- **Persistencia SQLite** opcional con fallback in-memory
- **Métricas Prometheus** para monitoreo y alertas

### Arquitectura

```
┌─────────────┐
│   GitHub    │
│  Webhooks   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│  GitSpy API (Express)               │
│  ┌───────────────────────────────┐  │
│  │ Webhook Handler (HMAC verify) │  │
│  └────────────┬──────────────────┘  │
│               ▼                     │
│  ┌───────────────────────────────┐  │
│  │   BullMQ Queue (Redis)        │  │
│  └────────────┬──────────────────┘  │
│               ▼                     │
│  ┌───────────────────────────────┐  │
│  │   Event Worker                │  │
│  │   - Save to DB                │  │
│  │   - Invalidate cache          │  │
│  │   - Fetch latest from GitHub  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
       │                    │
       ▼                    ▼
┌─────────────┐      ┌─────────────┐
│   Redis     │      │   SQLite    │
│   Cache     │      │   Database  │
└─────────────┘      └─────────────┘
```

## 🧪 Testing

### Suite de Tests Completa

El proyecto cuenta con una **estrategia de testing por capas** con 70+ tests implementados:

```bash
# Ejecutar todos los tests
npm test

# Tests unitarios (rápidos, sin dependencias externas)
npm run test:unit

# Tests de integración (requiere Redis)
npm run test:integration

# Tests end-to-end
npm run test:e2e

# Con reporte de cobertura
npm run test:coverage

# Modo watch para desarrollo
npm run test:watch

# Modo CI (para pipelines)
npm run test:ci
```

### Cobertura de Tests

**Estado actual: 70/70 tests unitarios pasando ✅**

| Componente       | Cobertura | Tests | Estado       |
| ---------------- | --------- | ----- | ------------ |
| Rate Limiter     | 100%      | 15    | ✅ Crítico   |
| Database         | 95%       | 18    | ✅           |
| Webhooks         | 100%      | 12    | ✅ Seguridad |
| GitHub Adapter   | 90%       | 14    | ✅           |
| Integration Flow | 85%       | 11    | ✅           |

### Componentes Críticos Testeados

1. **Rate Limiter** (`src/infra/rateLimiter.ts`):
   - ✅ Parsing de headers de GitHub
   - ✅ Consumo de tokens
   - ✅ Espera hasta reset
   - ✅ Backoff exponencial con cap

2. **Database** (`src/infra/db.ts`):
   - ✅ Inicialización de tablas
   - ✅ Upsert de repositorios
   - ✅ Guardado de eventos
   - ✅ Fallback in-memory

3. **Webhooks** (`src/routes/webhooks.ts`):
   - ✅ Validación HMAC timing-safe
   - ✅ Rechazo de firmas inválidas
   - ✅ Manejo de diferentes event types
   - ✅ Payloads grandes y caracteres especiales

4. **GitHub Adapter** (`src/infra/githubAdapter.ts`):
   - ✅ Fetch con rate limiting
   - ✅ Retry automático en errores
   - ✅ Actualización de rate limiter
   - ✅ Manejo de errores de red

### Test Helpers

Utilidades reutilizables en `tests/helpers/testUtils.ts`:

- `generateWebhookSignature()` - Firmas HMAC para tests
- `createMockRepo()` - Datos de repositorio mock
- `createMockWebhookPayload()` - Payloads de webhooks
- `waitFor()` - Espera condicional async
- `sleep()` - Delays para tests

## 🐳 Docker

### Desarrollo con Docker Compose

```bash
# Iniciar Redis + App
docker compose up --build

# Solo Redis (para tests locales)
docker run -d -p 6379:6379 redis:7-alpine
```

Variables de entorno ya configuradas para apuntar al servicio `redis`.

## 🚀 Despliegue en Vercel (Serverless)

El proyecto incluye soporte experimental para despliegue en Vercel, limitado a funcionalidades stateless (como el visualizador de Kanban).

- **Demo**: [https://vercel.com/medalcode-projects/git-spy](https://vercel.com/medalcode-projects/git-spy)
- **Funcionalidad Soportada**: API de lectura (`/api/repos/...`), Visualizador Kanban.
- **Limitaciones**: No soporta Workers (cola de eventos) ni persistencia local (SQLite/Redis) en este modo.

## 📊 Monitoreo

### Métricas Prometheus

La app expone métricas en `/metrics/prom`:

**Métricas personalizadas:**

- `gitspy_rate_remaining` - Tokens restantes del rate limit de GitHub
- `gitspy_rate_reset_unix` - Timestamp del reset del rate limit
- `gitspy_queue_waiting` - Trabajos en espera
- `gitspy_queue_active` - Trabajos en proceso
- `gitspy_queue_completed` - Trabajos completados
- `gitspy_queue_failed` - Trabajos fallidos

**Configuración Prometheus:**

```yaml
scrape_configs:
  - job_name: "gitspy"
    static_configs:
      - targets: ["localhost:3000"]
    metrics_path: "/metrics/prom"
```

### Reglas de Alerta

Ejemplos en `monitoring/prometheus/rules.yml`:

- **GitSpyRateLimitLow**: Alerta cuando quedan < 100 tokens
- **GitSpyQueueBacklog**: Alerta con > 50 trabajos en espera
- **GitSpyQueueFailures**: Alerta si hay trabajos fallidos

## 🏗️ Estructura del Proyecto

```
GitSpy/
├── src/
│   ├── config/           # Configuración centralizada
│   ├── core/             # Lógica de dominio
│   │   └── repository.ts
│   ├── infra/            # Infraestructura
│   │   ├── cache.ts      # Redis cache
│   │   ├── db.ts         # SQLite persistence
│   │   ├── inMemoryDb.ts # Fallback in-memory
│   │   ├── githubAdapter.ts  # GitHub API client
│   │   ├── queue.ts      # BullMQ queue
│   │   ├── rateLimiter.ts    # Rate limit control
│   │   └── webhookVerifier.ts # HMAC verification
│   ├── routes/           # Express routes
│   │   ├── webhooks.ts
│   │   ├── repositories.ts
│   │   └── metrics.ts
│   ├── workers/          # Background workers
│   │   └── eventWorker.ts
│   └── index.ts          # App entry point
├── tests/
│   ├── setup.ts          # Global test config
│   ├── helpers/          # Test utilities
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # End-to-end tests
├── monitoring/           # Prometheus rules
├── jest.config.cjs       # Jest configuration
├── tsconfig.json         # TypeScript config
├── Dockerfile
├── docker-compose.yml
└── Bitacora.md          # Development log
```

## 🔧 Desarrollo

### Scripts Disponibles

````bash
# Desarrollo
npm run dev              # Hot reload con ts-node-dev

## Vercel deployment (API-only)

- This project is deployed as API-only on Vercel. Only files under the `api/` directory are treated as serverless functions.
- The Vercel configuration (`vercel.json`) enforces that `/api/**` is routed to the serverless functions and that all other paths return a 404 status intentionally. This prevents any accidental execution of a legacy Node server at the root path.

- Expected behavior on Vercel:
  - `GET /api/repos/:owner/:repo/kanban` -> serverless function (200/4xx/5xx depending on request)
  - Any non-`/api` path (including `/`) -> `404 Not Found` (intentional)

If you need to run the legacy Express server locally for development or tests, use the dev script (`npm run dev`) which relies on `src/index.ts`. That code is excluded from Vercel deployments via `.vercelignore` and `vercel.json` to keep production API-only.

# Worker (dev): iniciar worker en proceso separado
npm run start:worker     # Start worker process (ts-node)

## Autoscaler (optional)

The repository includes a simple autoscaler logic decoupled from runtime. It polls Prometheus-style metrics endpoints and decides desired worker replicas based on: backlog (`gitspy_queue_waiting`), job latency (`gitspy_job_duration_ms`), and product Kanban signals (`kanban.json`). It delegates scaling to adapters (noop, k8s via `kubectl`, or a custom script).

Run locally:

```bash
# default (noop scaler):
npm run autoscaler

# use k8s scaler (requires kubectl and K8S_DEPLOYMENT env set):
SCALER=k8s K8S_DEPLOYMENT=my-deployment K8S_NAMESPACE=default npm run autoscaler

# use script scaler:
SCALER=script SCALE_SCRIPT=./scripts/scale_my_cluster.sh npm run autoscaler
````

Configuration is available via environment variables or CLI flags (see `scripts/autoscaler.js`).

## Progressive migration: SQLite → Postgres

This repo includes tooling and a safe plan to migrate from the default SQLite store to Postgres with zero downtime.

Key ideas:

- Use `DB_MODE=dual` to enable dual-write (writes go to both SQLite and Postgres) while the system runs.
- Use `scripts/migrate_sqlite_to_postgres.js` to copy historical data from SQLite to Postgres in a transactional, idempotent way.
- Validate counts and samples with `scripts/validate_consistency.js`.
- Once you're confident, switch `DB_MODE=postgres` (or point `SQLITE_PATH` away) to cut over reads to Postgres.

Steps (summary):

1. Provision Postgres and set `PG_CONN`.
2. Start app with `DB_MODE=dual` so new writes go to both DBs.
3. Run `node scripts/migrate_sqlite_to_postgres.js --pg="postgres://..."` to copy historical data.
4. Run `node scripts/validate_consistency.js --pg="postgres://..."` and/or `--sqlite=...` to validate counts and sample mismatches.
5. Run replay validation (optional) with `scripts/replay_events.js --out=... --dry-run` reading from Postgres if needed.
6. When satisfied, change `DB_MODE=postgres` and restart services (reads will now come from Postgres). Keep SQLite as fallback for a rollback path.

Commands examples:

```bash
# dual-write mode (start app):
DB_MODE=dual PG_CONN="postgres://user:pass@host:5432/db" npm run dev

# migrate historical data
node scripts/migrate_sqlite_to_postgres.js --pg="postgres://user:pass@host:5432/db"

# validate
node scripts/validate_consistency.js --pg="postgres://user:pass@host:5432/db"
```

# Build

npm run build # Compilar TypeScript

# Producción

npm start # Ejecutar build

# Tests

npm test # Todos los tests
npm run test:unit # Solo unitarios
npm run test:coverage # Con coverage report

# Utilidades

npm run test:webhook # Test manual de webhook

````

### Prerequisitos para Tests de Integración

```bash
# Iniciar Redis
docker run -d -p 6379:6379 redis:7-alpine

# Ejecutar tests de integración
npm run test:integration
````

## 📝 Uso de la API

### Endpoints

#### GET /health

Health check endpoint

```bash
curl http://localhost:3000/health
```

#### POST /webhooks

Recibir webhooks de GitHub

```bash
curl -X POST http://localhost:3000/webhooks \
  -H "x-github-event: push" \
  -H "x-hub-signature-256: sha256=..." \
  -H "Content-Type: application/json" \
  -d '{"repository": {...}}'
```

#### GET /repositories/:owner/:repo

Obtener información de repositorio (con cache multi-capa)

```bash
curl http://localhost:3000/repositories/octocat/Hello-World
```

#### GET /repos/:owner/:repo/kanban

Obtener el Kanban canónico generado a partir de `Bitacora.md` en la raíz del repositorio.

```bash
curl http://localhost:3000/repos/medalcode/GitSpy/kanban
```

Respuesta (ejemplo):

```json
{
  "repo": "medalcode/GitSpy",
  "kanban": {
    /* objeto Kanban canónico */
  },
  "meta": { "cached": false, "fetchedAt": "2026-01-27T12:00:00Z" }
}
```

Notas:

- El endpoint usa el contenido de `Bitacora.md` y retorna un JSON estable y versionado.
- Soporta `ETag` y responde `304` cuando el contenido no ha cambiado.
- Posibles códigos de respuesta: `200`, `304`, `404` (repo/file not found), `429` (rate limit), `500` (internal error).

**Headers de respuesta:**

- `X-Cache: HIT` - Servido desde Redis
- `X-Cache: DB` - Servido desde SQLite
- `X-Cache: GITHUB` - Fetched desde GitHub API

#### GET /metrics/prom

Métricas Prometheus

```bash
curl http://localhost:3000/metrics/prom
```

## 🔐 Seguridad

- **HMAC Verification**: Validación timing-safe de firmas de webhook
- **Rate Limiting**: Control inteligente de límites de GitHub API
- **Error Handling**: Manejo robusto de errores sin exposición de detalles internos
- **Environment Variables**: Credenciales en variables de entorno

## 📚 Documentación Adicional

- **[Bitácora de Desarrollo](Bitacora.md)** - Registro detallado de cambios
- **[Plan de Testing](.gemini/antigravity/brain/.../implementation_plan.md)** - Estrategia completa de QA
- **[Prometheus Rules](monitoring/prometheus/rules.yml)** - Reglas de alerta

## 🛣️ Roadmap

### Completado ✅

- [x] Servidor Express con rutas básicas
- [x] Integración con GitHub API
- [x] Sistema de caché con Redis
- [x] Cola de eventos con BullMQ
- [x] Validación HMAC de webhooks
- [x] Persistencia SQLite con fallback
- [x] Métricas Prometheus
- [x] **Suite completa de tests (70+ tests)**
- [x] **Infraestructura de CI/CD**
- [x] **Documentación completa**

### En Progreso 🚧

- [ ] Tests de integración con Redis real
- [ ] Tests E2E completos
- [ ] GitHub Actions workflow

### Próximos Pasos 📋

- [ ] Migración a PostgreSQL (producción)
- [ ] Autenticación de usuarios
- [ ] API de consulta avanzada
- [ ] Dashboard web
- [ ] Webhooks salientes (notificaciones)

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. **Ejecuta los tests** (`npm test`)
4. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
5. Push a la rama (`git push origin feature/AmazingFeature`)
6. Abre un Pull Request

**Importante**: Todos los PRs deben pasar la suite de tests completa.

## 📄 Licencia

Este proyecto es privado y de uso interno.

## 👥 Autores

- Desarrollo inicial y arquitectura
- Implementación de testing strategy (27/01/2026)

## 🙏 Agradecimientos

- GitHub API Documentation
- BullMQ Team
- Jest Testing Framework
- Redis Community

---

**Última actualización**: 27 de enero de 2026  
**Versión**: 0.1.0  
**Estado**: ✅ Testing Infrastructure Complete - 70/70 tests passing
