# Memory — Houdini Bet

## Decisiones
- Producción Cloudflare Workers + D1 + Cron; D1 aislado del QR; ventana **14 días**
- Sync: FD (top5 + UNL + UCL + UEL) + FotMob Friendlies + **Segunda** (LaLiga2 id 140 → api 141, namespace 850M)
- Allowlist: domésticas + Segunda + UNL + Champions + Europa + Friendlies
- UI: control-deck (ventana+fecha compacta | ámbito+En vivo | ligas snap); Cuotas bandas **sin @**
- Mejores load `limit=30` + Ver más; GET listados solo missing preds ≤5; poll 60s = refresh-live + patch
- Auto-sync si stale >12h; settle/backfill en sync

## Hecho
- Tips Poisson; Mejores; Partidos; Aciertos; Cuotas; PWA; escudos; tip_odds
- URL: https://houdini-bet.ivanmarrtin2703.workers.dev

## Pendiente
- Key AF: `wrangler secret put API_FOOTBALL_KEY`
- Filtros estadísticos avanzados; share / favoritos

## Notas
- Deploy: `cd cloudflare && npx wrangler deploy`
- Sync: POST `/api/v1/sync/manual` + `x-sync-secret`
