Bitacora
📌 Meta

Project: GitSpy

Owner: Medalcode

Repo: GitSpy

Started: 2026-01-27

LastUpdate: 2026-01-30

🧱 Features
[DONE] F-001 — Implementar parser de Bitacora
Description: Crear parser puro y determinista (src/bitacoraParser.js) para convertir markdown a objeto Kanban.
Tags: parser, core
Started: 2026-01-27
Completed: 2026-01-27

[DONE] F-002 — Servicio de Kanban con Cache
Description: Implementar servicio que obtiene Bitacora.md de GitHub, parsea y cachea con TTL y ETag.
Tags: backend, cache
Started: 2026-01-27
Completed: 2026-01-27

[DONE] F-003 — API Endpoint para Kanban
Description: Exponer ruta GET /repos/:owner/:repo/kanban en formato JSON estandarizado.
Tags: api, endpoint
Started: 2026-01-27
Completed: 2026-01-27

[DONE] F-004 — Cliente Visual AutoKanban
Description: Aplicación React (Vite) para visualizar el tablero Kanban consumiendo la API.
Tags: frontend, ui
Started: 2026-01-27
Completed: 2026-01-27

[DONE] F-005 — Despliegue en Vercel
Description: Configuración y despliegue del proyecto en infraestructura Serverless de Vercel.
Tags: devops, deploy
Started: 2026-01-27
Completed: 2026-01-29

[DONE] F-006 — Compatibilidad ES Modules
Description: Migración de módulos CommonJS a ESM y corrección de imports para soporte nativo.
Tags: refactor, technical-debt
Started: 2026-01-28
Completed: 2026-01-28

[DONE] F-007 — Fix Bundling Serverless
Description: Corrección de imports dinámicos y configuración de rutas para funcionamiento correcto en Vercel.
Tags: bugfix, vercel
Started: 2026-01-29
Completed: 2026-01-29

[DONE] F-008 — Tests Unitarios Core
Description: Estabilización y ejecución exitosa de suite de tests unitarios (70/70 passing).
Tags: testing, quality
Started: 2026-01-27
Completed: 2026-01-28

[TODO] F-009 — Tests de Integración Kanban
Description: Crear tests automatizados para validar el flujo completo del endpoint Kanban.
Tags: testing
Priority: high

[TODO] F-010 — Persistencia PostgreSQL
Description: Migrar de SQLite a PostgreSQL para soportar estado persistente en entorno Serverless.
Tags: master project, database
Priority: medium

[DONE] F-011 — Autenticación Básica
Description: Se decidió NO implementar auth para lectura pública. (Ver README.md)
Tags: security, decision
Started: 2026-02-01
Completed: 2026-02-01

[DONE] F-014 — Consolidación Arquitectónica
Description: Unificación de AutoKanban como UI interna en app e integración del parser en core.
Tags: architecture, refactor
Started: 2026-02-01
Completed: 2026-02-01

[TODO] F-012 — CI Linter para Bitacora
Description: GitHub Action que valide el formato de Bitacora.md en Pull Requests.
Tags: ci, quality
Priority: medium

[TODO] F-013 — Verificar Logs de Producción
Description: Monitoreo de logs en Vercel tras tráfico real para detectar anomalías.
Tags: ops, monitoring
Priority: medium
