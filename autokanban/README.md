AutoKanban — simple React client for GITSPY

Run locally:

1. cd autokanban
2. npm install
3. npm run dev

By default the client calls `http://localhost:3000` as the GITSPY API. To change, set `VITE_GITSPY_BASE` in the environment.

Design notes:
- Stateless UI, local React state only.
- The app never interprets rules — it renders exactly what the backend returns.
