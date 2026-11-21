# Changelog — frontend/backend integration pass

Contract v1 was **not** changed. Every entry below is either wiring, tooling or a mock refresh.

## Backend

| File | What | Why |
| --- | --- | --- |
| `backend/.env` (new, git-ignored) | `LLM_PROVIDER=none`, `CORS_ORIGINS=http://localhost:3000`, `MAX_UPLOAD_MB=25` | The integration runbook requires a backend env file so template mode and the port-3000 origin are explicit rather than implicit defaults. |
| `backend/.env.example` | Removed the stray `[TEMPLATE]` first line | The marker is not valid dotenv syntax; copying the file to `.env` verbatim would inject a bogus key. |
| `backend/contract_examples/*.json` | Regenerated with `scripts/export_examples.py` | Step 4 requires one real response per endpoint from the demo dataset. |

No route, schema, field, enum, status code or status-mapping change was needed: the audit of
`app/schemas.py` + `app/api/*.py` against the contract found no drift.

## Frontend

| File | What | Why |
| --- | --- | --- |
| `frontend/mocks/*.json` (16 files) | Replaced with the newly exported real responses | Mock mode must replay reality, not a stale snapshot. `mockdb.ts` continues to rebase every fixture onto `demo-mock` and to derive live KPI counts. |
| `app/dev/contract/page.tsx` | The self-test now polls `GET /api/progress/:id` until `done`/`error` (90 s cap) after `POST /api/analyze/:id` | It previously read `/api/overview` and `/api/findings` in the same tick as the analyze call. Because analyze returns immediately by contract, the run showed `409 Analysis has not run for this dataset yet` and `No findings were returned.` — 10/12 instead of 15/15. Fixing the frontend (not the contract) was correct: polling progress is the contract's own flow. |
| `components/ui.tsx` (`useCountUp`) | Added a timeout that settles the counter on the real value even if no animation frame runs | `requestAnimationFrame` is paused in background/hidden tabs, so KPI cards could display `0` while the API returned real numbers (observed: API `16/2/66/3/1`, UI `0/0/0/0/0`). The hook now guarantees the true value independently of animation frames. |

No other component or API-client change was needed: `lib/api.ts` already validates every response with zod, uses
`NEXT_PUBLIC_API_URL`, posts multipart as `files`, polls `/api/progress/:id` once per second and never awaits
`/api/analyze`.

## Repository tooling

| File | What | Why |
| --- | --- | --- |
| `package.json` (root, new) | `npm run dev` / `dev:mock` / `test` | One command must start both projects. No dependencies, no lockfile, so nothing to install. |
| `scripts/dev.mjs` (new) | Dependency-free launcher: spawns uvicorn (`--reload`, :8000) and `next dev` (:3000), prefixes output, kills both on Ctrl+C, `--mock` skips the backend | Keeps the two projects a single product in one repo. |
| `run.bat`, `run.sh` (new) | Thin wrappers around the launcher | Matches the requested run-script entry points on both OSes. |
| `README.md` | Added the one-command quick start and a pointer to `backend/.env` | Setup had two manual terminals and no root entry point. |

## Contract questions

None blocking. Two gaps are documented in the final integration report (upload pre-analysis quality score, and
post-decision `evidenceRows` being returned uncapped by the decision endpoint).
