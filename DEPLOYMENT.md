# Deployment (Vercel Git auto-deploy)

This repository is connected to the Vercel project `reviewpilot` (team `alay-s-projects`).
Pushing to `main` auto-deploys to **https://reviewpilot.vercel.app**.

`vercel.json` points Vercel's build at `bash ./build-vercel.sh`, which emits a Vercel
Build Output API v3 bundle (`.vercel/output`) — this is why Git deploys now produce a
valid site instead of the previous empty/NOT_FOUND deployment.

Production env vars (`ANTHROPIC_API_KEY`, `OUTSCRAPER_API_KEY`) are stored on the Vercel
project, keeping the deployed site out of demo mode. See
`/home/team/shared/vercel-git-autodeploy.md` for the full write-up and the manual `go-live.sh`
fallback.
