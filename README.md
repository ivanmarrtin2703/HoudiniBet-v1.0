# Houdini Bet

Predicciones de fútbol (Poisson). **Producción en Cloudflare** (Workers + D1 + UI estática). CLI local opcional.

## URL en vivo

https://houdini-bet.ivanmarrtin2703.workers.dev

- UI: misma URL  
- API: `/api/v1/...`  
- Health: `/health`  
- D1: `houdini-bet-db` (**aislado del proyecto QR**)  
- Cron sync: `0 6 * * *` (UTC)

## Stack Cloudflare (`cloudflare/`)

```bash
cd cloudflare
npm install
npx wrangler deploy
```

| Recurso | Nombre |
|---------|--------|
| Worker | `houdini-bet` |
| D1 | `houdini-bet-db` |
| Secret | `SYNC_SECRET` (ya puesto) |
| Secret opcional | `API_FOOTBALL_KEY` (stats/odds premium; no obligatorio) |
| Var | `LEAGUE_IDS=140,141,39,135,78,61,5` (incl. Nations League) |

Migraciones D1: `npx wrangler d1 migrations apply houdini-bet-db --remote`

### Partidos reales (sin API key)

Por defecto Sync / auto-sync (si `last_sync_at` > 12h) usa [FixtureDownload](https://fixturedownload.com/): La Liga, Premier, Serie A, Bundesliga, Ligue 1 y Nations League, ventana **hoy + 14 días**. Segunda no tiene feed estable aún.

1. Pulsa **Sync** en la UI (header `x-sync-secret`) o:

```bash
curl -X POST https://houdini-bet.ivanmarrtin2703.workers.dev/api/v1/sync/manual \
  -H "x-sync-secret: TU_SYNC_SECRET"
```

2. Comprueba: `GET /api/v1/status` → `"source":"fixturedownload"`, `"mode":"live"`.

Opcional — más datos/odds con API-Football:

```bash
cd cloudflare
npx wrangler secret put API_FOOTBALL_KEY
```

Con key, Sync prioriza API-Football.

## API

| Método | Ruta |
|--------|------|
| GET | `/api/v1/status` (demo vs live) |
| GET | `/api/v1/matches/today?days=0\|14` |
| GET | `/api/v1/matches/best-bets?days=0\|14` |
| GET | `/api/v1/matches/:id/prediction` |
| GET | `/api/v1/teams/search?q=` |
| GET | `/api/v1/teams/:id` |
| GET | `/api/v1/leagues` |
| POST | `/api/v1/sync/manual` (header `x-sync-secret`) |

## CLI (opcional)

```bash
cd backend
copy .env.example .env
# API_BASE_URL=https://houdini-bet.ivanmarrtin2703.workers.dev
npm install
npm run cli
```

Con `API_BASE_URL` el CLI habla con Cloudflare (no necesita MySQL). Sin esa var, usa MySQL local legacy.

## Legacy local

`backend/` (Express) + `database/schema.sql` (MySQL) siguen disponibles para desarrollo offline. No es el runtime de producción.

## Agente

Ver `AGENTS.md` y `Memory.md`.
