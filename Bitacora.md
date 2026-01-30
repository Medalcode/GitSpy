Bitacora
📌 Meta

Project: GitSpy

Owner: Medalcode

Repo: GitSpy

Started: 2026-01-27

LastUpdate: 2026-01-29

🧱 Features
[DONE] feat-kanban-parser — Implementar parser de Bitacora
Description: Crear parser puro y determinista (src/bitacoraParser.js) para convertir markdown a objeto Kanban.
Tags: parser, core
Started: 2026-01-27
Completed: 2026-01-27

[DONE] feat-kanban-service — Servicio de Kanban con Cache
Description: Implementar servicio que obtiene Bitacora.md de GitHub, parsea y cachea con TTL y ETag.
Tags: backend, cache
Started: 2026-01-27
Completed: 2026-01-27

[DONE] feat-kanban-endpoint — API Endpoint para Kanban
Description: Exponer ruta GET /repos/:owner/:repo/kanban en formato JSON estandarizado.
Tags: api, endpoint
Started: 2026-01-27
Completed: 2026-01-27

[DONE] feat-autokanban-client — Cliente Visual AutoKanban
Description: Aplicación React (Vite) para visualizar el tablero Kanban consumiendo la API.
Tags: frontend, ui
Started: 2026-01-27
Completed: 2026-01-27

[DONE] feat-vercel-deploy — Despliegue en Vercel
Description: Configuración y despliegue del proyecto en infraestructura Serverless de Vercel.
Tags: devops, deploy
Started: 2026-01-27
Completed: 2026-01-29

[DONE] fix-esm-compat — Compatibilidad ES Modules
Description: Migración de módulos CommonJS a ESM y corrección de imports para soporte nativo.
Tags: refactor, technical-debt
Started: 2026-01-28
Completed: 2026-01-28

[DONE] fix-vercel-bundling — Fix Bundling Serverless
Description: Corrección de imports dinámicos y configuración de rutas para funcionamiento correcto en Vercel.
Tags: bugfix, vercel
Started: 2026-01-29
Completed: 2026-01-29

[DONE] chore-unit-tests — Tests Unitarios Core
Description: Estabilización y ejecución exitosa de suite de tests unitarios (70/70 passing).
Tags: testing, quality
Started: 2026-01-27
Completed: 2026-01-28

[TODO] test-integration-kanban — Tests de Integración Kanban
Description: Crear tests automatizados para validar el flujo completo del endpoint Kanban.
Tags: testing
Priority: high

[TODO] feat-persistence-postgres — Persistencia PostgreSQL
Description: Migrar de SQLite a PostgreSQL para soportar estado persistente en entorno Serverless.
Tags: master project, database
Priority: medium

[TODO] feat-auth-basic — Autenticación Básica
Description: Proteger el endpoint de Kanban con autenticación simple si se hace público.
Tags: security
Priority: low

[TODO] chore-ci-linter — CI Linter para Bitacora
Description: GitHub Action que valide el formato de Bitacora.md en Pull Requests.
Tags: ci, quality
Priority: medium

[TODO] chore-verify-logs — Verificar Logs de Producción
Description: Monitoreo de logs en Vercel tras tráfico real para detectar anomalías.
Tags: ops, monitoring
Priority: medium
