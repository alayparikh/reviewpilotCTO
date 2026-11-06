# Deployment (Vercel Git auto-deploy)

This repository is connected to the Vercel project `reviewpilot` (team `alay-s-projects`).
Pushing to `main` auto-deploys to the stable production URL
**https://reviewpilot-alay-s-projects.vercel.app**.

`vercel.json` points Vercel's build at `bash ./build-vercel.sh`, which emits a Vercel
Build Output API v3 bundle (`.vercel/output`) — this is why Git deploys now produce a
valid site instead of the previous empty/NOT_FOUND deployment.

## Production environment variables

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Real AI reply generation. Missing → labeled demo replies. |
| `REVIEWS_API_KEY` | Key for the external review-data provider that supplies Google reviews. Missing → labeled demo reviews. |
| `REVIEWS_API_URLS` | Comma-separated provider base URLs, tried in order. |
| `REVIEWS_API_SEARCH_PATH` | Path of the provider's business-search endpoint. |
| `REVIEWS_API_REVIEWS_PATH` | Path of the provider's reviews endpoint. |
| `DATABASE_URL` | Postgres store. Missing → in-memory demo mode. |

The review-data provider is intentionally **not named anywhere in this repository**: its
hosts, endpoint paths and key live only in these environment variables (Vercel project
settings for production, and the machine env for local runs). Keep it that way — the repo
is public and the deployed JS bundles are public.

See `/home/team/shared/vercel-git-autodeploy.md` for the full write-up and the manual
`go-live.sh` fallback.
