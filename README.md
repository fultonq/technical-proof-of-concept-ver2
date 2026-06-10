# TTB Label Review PoC

An AI-powered compliance dashboard that analyzes alcohol beverage labels against TTB (Alcohol and Tobacco Tax and Trade Bureau) mandatory labeling requirements. Upload a label image — Claude Vision extracts every required field and runs automated compliance checks in seconds.

**Live app:** see deployment URL once published.

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- An Anthropic API key (or use Replit's built-in Anthropic integration — no key needed there)

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Yes | Anthropic API base URL (set automatically in Replit) |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Yes | Anthropic API key (set automatically in Replit) |
| `SESSION_SECRET` | Yes | Express session secret |
| `DATABASE_URL` | No | Not used — in-memory store only for PoC |

### Run locally

```bash
# Install all workspace dependencies
pnpm install

# Start the API server (port 8080 by default, reads $PORT)
pnpm --filter @workspace/api-server run dev

# In a second terminal, start the frontend (reads $PORT)
pnpm --filter @workspace/ttb-label-review run dev
```

The API mounts at `/api/v1/labels` and the React app at `/`.

### Run on Replit

Open the project in Replit — both workflows start automatically. No configuration needed; the Anthropic integration is pre-wired.

---

## Project Structure

```
ttb-label-review/                   ← repo root
│
├── README.md                       ← this file
├── package.json                    ← root dev tooling (TypeScript, ESLint, Vitest)
├── pnpm-workspace.yaml             ← workspace package discovery + catalog pins
├── tsconfig.json                   ← solution file referencing all composite libs
├── tsconfig.base.json              ← shared strict TypeScript defaults
│
├── artifacts/                      ← deployable applications
│   │
│   ├── api-server/                 ← Express 5 REST API (port $PORT, default 8080)
│   │   ├── build.mjs               ← esbuild bundler config (bundles to ESM CJS-compat)
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts            ← entry point: reads PORT, starts HTTP server
│   │       ├── app.ts              ← Express app factory: CORS, JSON, routes, 404/error handlers
│   │       ├── lib/
│   │       │   ├── label-types.ts      ← all TypeScript interfaces (LabelAnalysisResult,
│   │       │   │                         FieldResult, ComplianceFlag, ClaudeExtractionResult…)
│   │       │   ├── claude-vision.ts    ← sends image to Claude via Anthropic SDK;
│   │       │   │                         structured prompt returns ClaudeExtractionResult JSON
│   │       │   ├── compliance-engine.ts← field-by-field compliance checks (Gov Warning exact
│   │       │   │                         match, brand fuzzy match, conditional ABV, etc.)
│   │       │   ├── label-analyzer.ts   ← orchestrator: calls claude-vision → compliance-engine
│   │       │   │                         → assembles LabelAnalysisResult with PASS/FAIL/REVIEW
│   │       │   ├── session-store.ts    ← in-memory Map<sessionId, LabelAnalysisResult[]>;
│   │       │   │                         CRUD helpers (add, get, delete)
│   │       │   └── logger.ts           ← pino logger singleton
│   │       └── routes/
│   │           ├── index.ts            ← mounts health + labels routers
│   │           ├── health.ts           ← GET /api/v1/health — liveness probe
│   │           └── labels.ts           ← all label endpoints (multer file handling,
│   │                                     upload, batch, session, label, delete)
│   │
│   └── ttb-label-review/           ← React + Vite frontend (port $PORT, default 25257)
│       ├── vite.config.ts          ← Vite config: BASE_URL from env, path alias @/ → src/
│       ├── tailwind.config.ts      ← Tailwind config: custom colors (pass/fail/review/primary)
│       ├── package.json
│       └── src/
│           ├── main.tsx            ← React entry: mounts <App /> into #root
│           ├── App.tsx             ← Root component: QueryClientProvider, WouterRouter,
│           │                         header bar, route declarations
│           ├── index.css           ← Tailwind base + CSS custom properties (government-blue
│           │                         theme, pass/fail/review color tokens)
│           ├── pages/
│           │   ├── upload.tsx      ← Upload page (/): drag-and-drop, single/batch tabs,
│           │   │                     optional expectedBrandName field, sequential queue
│           │   ├── results.tsx     ← Session dashboard (/results/:sessionId): summary bar,
│           │   │                     searchable table, CSV export
│           │   ├── label-detail.tsx← Label detail (/results/:sessionId/:labelId):
│           │   │                     per-field breakdown, Gov Warning side-by-side,
│           │   │                     SFOV panel, compliance flags, evaluator actions
│           │   └── not-found.tsx   ← 404 fallback
│           ├── components/ui/
│           │   ├── status-badge.tsx← <StatusBadge status="PASS|FAIL|REVIEW|…" />
│           │   │                     enforces PASS=green, FAIL=red, REVIEW=amber
│           │   ├── confidence-bar.tsx ← <ConfidenceBar score={0.0–1.0} /> numeric + bar
│           │   └── …               ← shadcn/ui primitives (button, card, table, alert,
│           │                         tabs, input, badge, toast, etc.)
│           ├── lib/
│           │   ├── csv-export.ts   ← client-side CSV generator; triggers browser download
│           │   └── utils.ts        ← cn() Tailwind class merger utility
│           └── hooks/
│               ├── use-toast.ts    ← toast notification state hook
│               └── use-mobile.tsx  ← responsive breakpoint hook
│
└── lib/                            ← shared workspace libraries (composite, emit declarations)
    │
    ├── api-spec/                   ← source of truth for the API contract
    │   ├── openapi.yaml            ← OpenAPI 3.1 spec: all endpoints, request/response schemas
    │   └── orval.config.ts         ← Orval codegen config: generates api-client-react
    │                                 and api-zod from openapi.yaml
    │
    ├── api-client-react/           ← generated React Query hooks (do not edit by hand)
    │   └── src/
    │       ├── generated/
    │       │   ├── api.ts          ← useUploadLabel, useGetSessionResults, useGetLabelResult,
    │       │   │                     useDeleteSession mutations + queries
    │       │   └── api.schemas.ts  ← TypeScript types mirroring OpenAPI schemas
    │       ├── custom-fetch.ts     ← fetch wrapper that reads BASE_URL from env
    │       └── index.ts            ← barrel export
    │
    ├── api-zod/                    ← generated Zod validation schemas (do not edit by hand)
    │   └── src/generated/
    │       ├── api.ts              ← Zod schemas for each endpoint (used server-side)
    │       └── types/              ← per-type Zod schemas (LabelAnalysisResult, etc.)
    │
    └── integrations-anthropic-ai/  ← Anthropic SDK wrapper
        └── src/
            ├── client.ts           ← initializes Anthropic client from env vars
            │                         (AI_INTEGRATIONS_ANTHROPIC_BASE_URL + API_KEY)
            ├── index.ts            ← exports { anthropic } singleton
            └── batch/
                ├── index.ts        ← batchProcess(): runs array of tasks with
                │                     concurrency limiting and retry logic
                └── utils.ts        ← retry helpers (p-retry), concurrency (p-limit)
```

## Architecture

```
artifacts/
  api-server/          Express 5 API — label ingestion, Claude Vision, compliance engine
  ttb-label-review/    React + Vite frontend — upload UI, results dashboard, detail view
lib/
  api-spec/            OpenAPI 3.1 contract (single source of truth)
  api-client-react/    Generated React Query hooks + Zod schemas (via Orval)
  integrations-anthropic-ai/   Anthropic SDK wrapper with retry + batch helpers
```

### Request flow

```
Browser  →  POST /api/v1/labels/upload (multipart image)
         →  multer buffers file in memory
         →  Claude Vision (claude-sonnet-4-6): extracts all TTB fields as structured JSON
         →  Compliance Engine: runs field-by-field checks
         →  Returns LabelAnalysisResult with PASS / FAIL / NEEDS REVIEW status per field
         →  Stored in in-memory session store (Map keyed by sessionId)
```

---

## Tools & Libraries

| Layer | Choice | Why |
|---|---|---|
| AI vision | Anthropic `claude-sonnet-4-6` | Best-in-class structured output from images; reliable JSON extraction from label text |
| API framework | Express 5 + Zod validation | Fast iteration, mature ecosystem, Zod gives runtime type safety |
| Frontend | React + Vite + Tailwind + shadcn/ui | Rapid component assembly; shadcn gives accessible primitives without a heavy design system |
| API contract | OpenAPI 3.1 → Orval codegen | Contract-first keeps frontend/backend in sync; generated React Query hooks eliminate boilerplate |
| Routing | Wouter | Lightweight client-side routing; no overhead of React Router |
| State/data | TanStack Query | Caching and background refetch for session/label queries |
| Session store | In-memory `Map` | Sufficient for PoC; swap in Redis or Postgres for production |

---

## Compliance Checks

All checks are in `artifacts/api-server/src/lib/compliance-engine.ts`.

| Check | Method | Pass condition |
|---|---|---|
| **Government Warning** | Exact string match (normalized whitespace) | Extracted text equals the full required statement verbatim; `GOVERNMENT WARNING:` prefix must be ALL CAPS |
| **Brand Name** | Fuzzy match — Levenshtein distance ≤ 2 on normalized strings | Extracted brand is within edit distance 2 of expected; if no expected value provided, passes when confidence ≥ 0.6 |
| **Alcohol Content (ABV)** | Conditional presence + format check | Required for distilled spirits and wine ≥ 7% ABV; must include `%` character; not mandatory for standard malt beverages |
| **Net Contents** | Presence check | Field must be non-null |
| **Class / Type** | Presence check | Field must be non-null |
| **Bottler / Producer** | Presence check (beverage-gated) | Required for spirits and wine; optional for malt |
| **Country of Origin** | Presence check (import-gated) | Required only when Claude flags the product as an import |
| **Label Language** | Presence check | Primary label language must be identified |
| **Prohibited Surfaces** | Claude semantic check | Flags images that depict drinking vessels, children, Santa Claus, or other TTB-prohibited imagery |
| **Same Field of Vision** | Claude layout check | Brand name, class/type, ABV, and net contents should appear on the same principal display panel |

### Overall status logic

- **FAIL** — any mandatory field is `FAIL`
- **NEEDS REVIEW** — any field is `NEEDS_REVIEW` (low confidence, borderline match, or ambiguous layout)
- **PASS** — all mandatory fields pass and no review flags exist

---

## API Reference

Base path: `/api/v1/labels`

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/upload` | `multipart/form-data` — `file` (image), optional `sessionId`, `expectedBrandName` | `LabelAnalysisResult` |
| `POST` | `/batch` | `multipart/form-data` — `files[]` (images), optional `sessionId` | `BatchAnalysisResult` |
| `GET` | `/session/:sessionId` | — | `BatchAnalysisResult` |
| `GET` | `/:labelId` | — | `LabelAnalysisResult` |
| `DELETE` | `/session/:sessionId` | — | `204 No Content` |

---

## Frontend Pages

| Route | Page | Features |
|---|---|---|
| `/` | Upload | Drag-and-drop, single / batch toggle, per-file queue with live status, optional expected brand name field |
| `/results/:sessionId` | Dashboard | Summary bar (total / pass / fail / review counts), filterable + sortable table, CSV export, link to detail |
| `/results/:sessionId/:labelId` | Label Detail | Per-field breakdown with extracted vs. expected value, confidence bar, compliance flags with severity badges |

---

## Assumptions & Trade-offs

**In-memory session store** — Sessions live in a Node.js `Map` and are lost on server restart. Acceptable for a PoC; a production version would use Redis or Postgres.

**Single-image analysis only** — TTB requires "same field of vision" across the full label (which may wrap around the bottle). Claude's layout check is a best-effort inference from a single image. A production system would accept multiple panel images per SKU.

**Brand name fuzzy matching** — The Levenshtein threshold (edit distance ≤ 2) handles minor OCR noise and punctuation differences. For known SKUs, the caller should supply `expectedBrandName` in the upload request for a tighter match.

**Government Warning exact match** — The required warning text is hardcoded (`compliance-engine.ts`, line ~14) from 27 CFR Part 16. The check normalizes whitespace before comparing. Variations in line breaks are tolerated; missing words are not.

**No auth layer** — This PoC omits authentication. Production deployment would gate the tool behind SSO or API key auth.

**Claude model** — `claude-sonnet-4-6` is used for the best accuracy/speed trade-off. Swapping to `claude-opus-4-5` would improve accuracy on degraded or small-print labels at higher cost.

**File size limit** — Uploads are capped at 10 MB per image by the multer config. TTB submissions are typically 300 KB–2 MB JPEGs.

---

## Generating Test Labels

AI image generation works well. Prompt example:

> "Alcohol beverage label for 'Old Tom Distillery' Kentucky Straight Bourbon Whiskey, 45% Alc./Vol. (90 Proof), 750 mL, standard US government warning statement, bottled by Old Tom Distillery, Louisville KY"

Any image with readable text will work — the system is tolerant of low-resolution or synthetic labels.

---

## Development Commands

```bash
pnpm run typecheck           # Full typecheck across all packages
pnpm run build               # Typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen   # Regenerate API client from OpenAPI spec
```
