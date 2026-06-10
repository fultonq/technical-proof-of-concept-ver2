# TTB Label Review PoC

An AI-powered compliance dashboard for government review agents. Upload an alcohol beverage label image — Claude Vision extracts every required TTB field and runs automated compliance checks in seconds, returning **PASS / FAIL / NEEDS REVIEW** with field-level detail and remediation guidance.

Handles all three label types: **Beer/Malt Beverage (27 CFR Part 7)**, **Distilled Spirits (27 CFR Part 5)**, and **Wine (27 CFR Part 4)**.

**Live app:** see deployment URL once published.

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- An Anthropic API key — or use Replit's built-in Anthropic integration (no key needed)

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Yes | Anthropic API base URL (auto-set in Replit) |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Yes | Anthropic API key (auto-set in Replit) |
| `SESSION_SECRET` | Yes | Express session secret |
| `DATABASE_URL` | No | Not used — in-memory store for PoC |

### Run locally

```bash
pnpm install

# Terminal 1 — API server (default port 8080, reads $PORT)
pnpm --filter @workspace/api-server run dev

# Terminal 2 — React frontend (reads $PORT)
pnpm --filter @workspace/ttb-label-review run dev
```

The API is served at `/api` and the frontend at `/`.

### Run on Replit

Open the project — both workflows start automatically. The Anthropic integration is pre-wired; no configuration needed.

---

## What It Does

| Mode | Description |
|---|---|
| **One Label** | Upload a JPEG/PNG/WebP label photo. Optional: add a back label image so Claude can extract fields that span both panels (e.g. Government Warning on the back). |
| **Multiple Labels** | Queue up to 50 label images for sequential processing, all grouped in one session. |
| **Generate Label Image** | Paste or type label text (or upload a `.txt` file) — Claude generates a photorealistic SVG label, which is then submitted for compliance checking. |
| **CSV Import** | Upload a CSV of label applications. The app generates an AI label image for each row, runs the full compliance engine, and collects all results in one session report. |

---

## Project Structure

```
ttb-label-review/
│
├── README.md
├── package.json                    ← root dev tooling (TypeScript, ESLint, Vitest)
├── pnpm-workspace.yaml             ← workspace package discovery + catalog pins
├── tsconfig.json                   ← solution file referencing composite libs
├── tsconfig.base.json              ← shared strict TypeScript defaults
│
├── sample_data/
│   └── applications.csv            ← sample CSV for CSV Import mode (3 label rows)
│
├── artifacts/
│   │
│   ├── api-server/                 ← Express 5 REST API (port $PORT, default 8080)
│   │   ├── build.mjs               ← esbuild bundler config
│   │   └── src/
│   │       ├── index.ts            ← reads PORT, starts HTTP server
│   │       ├── app.ts              ← Express factory: CORS, JSON, routes, error handlers
│   │       ├── lib/
│   │       │   ├── label-types.ts      ← all TS interfaces (LabelAnalysisResult,
│   │       │   │                         FieldResult, ComplianceFlag, ClaudeExtractionResult)
│   │       │   ├── claude-vision.ts    ← sends one or two images to Claude Vision;
│   │       │   │                         structured prompt returns ClaudeExtractionResult JSON
│   │       │   ├── compliance-engine.ts← field-by-field compliance checks per beverage type
│   │       │   ├── label-analyzer.ts   ← orchestrator: vision → compliance → session store
│   │       │   ├── label-generator.ts  ← generates SVG label images from free-form text
│   │       │   ├── session-store.ts    ← in-memory Map<sessionId, LabelAnalysisResult[]>
│   │       │   └── logger.ts           ← pino logger singleton
│   │       └── routes/
│   │           ├── health.ts           ← GET /api/healthz
│   │           └── labels.ts           ← all label endpoints (upload, batch,
│   │                                     generate-preview, session CRUD)
│   │
│   └── ttb-label-review/           ← React + Vite frontend
│       ├── vite.config.ts
│       ├── tailwind.config.ts      ← custom color tokens: pass/fail/review/primary
│       └── src/
│           ├── App.tsx             ← QueryClientProvider, WouterRouter, route declarations
│           ├── pages/
│           │   ├── upload.tsx      ← four upload modes: single, batch, generate, CSV import
│           │   ├── results.tsx     ← session dashboard: counts, filter, sort, CSV export
│           │   ├── label-detail.tsx← per-field breakdown, Gov Warning comparison,
│           │   │                     SFOV panel, wine-specific fields, "How to Fix" guide
│           │   └── not-found.tsx
│           ├── components/ui/
│           │   ├── status-badge.tsx← PASS=green, FAIL=red, REVIEW=amber, N/A=grey
│           │   ├── confidence-bar.tsx
│           │   └── …               ← shadcn/ui primitives
│           └── lib/
│               ├── corrections.ts  ← per-field remediation guidance (all 12 fields)
│               ├── csv-label.ts    ← CSV parser + row-to-label-text formatter
│               └── csv-export.ts   ← client-side CSV download of session results
│
└── lib/                            ← shared workspace libraries
    ├── api-spec/
    │   ├── openapi.yaml            ← OpenAPI 3.1 spec — single source of truth
    │   └── orval.config.ts         ← codegen config → api-client-react + api-zod
    ├── api-client-react/           ← generated React Query hooks + TypeScript types
    ├── api-zod/                    ← generated Zod validation schemas (server-side)
    └── integrations-anthropic-ai/  ← Anthropic SDK wrapper with batch + retry helpers
```

---

## Architecture

### Request flow — label upload

```
Browser
  → POST /api/v1/labels/upload (multipart: file + optional backFile)
  → multer buffers image(s) in memory (max 10 MB per file)
  → claude-vision.ts  — sends 1–2 images to claude-sonnet-4-6 in one message
                         structured system prompt → ClaudeExtractionResult JSON
  → compliance-engine.ts — runs all field checks against extracted values
  → label-analyzer.ts — assembles LabelAnalysisResult, stores in session Map
  → returns { labelId, sessionId, overallStatus: PASS|FAIL|REVIEW, … }
```

### Request flow — CSV import (client-orchestrated)

```
Browser: parse CSV rows
  For each row →
    POST /api/v1/labels/generate-preview { labelText }
      Claude generates SVG label image
    Browser converts SVG → PNG via off-screen <canvas>
    POST /api/v1/labels/upload (multipart: PNG, sessionId)
      Same compliance pipeline as above
  Navigate to /results/:sessionId
```

---

## Tools & Libraries

| Layer | Choice | Why |
|---|---|---|
| AI vision | Anthropic `claude-sonnet-4-6` | Best-in-class structured extraction from images |
| API | Express 5 + Zod | Fast iteration; Zod gives runtime type safety |
| Frontend | React + Vite + Tailwind + shadcn/ui | Rapid assembly; accessible primitives |
| API contract | OpenAPI 3.1 → Orval codegen | Contract-first keeps frontend/backend in sync |
| Routing | Wouter | Lightweight, no React Router overhead |
| Data fetching | TanStack Query | Caching + background refetch for session queries |
| Session store | In-memory `Map` | Sufficient for PoC; swap Redis/Postgres for production |

---

## Compliance Checks

All logic lives in `artifacts/api-server/src/lib/compliance-engine.ts`.

### Common checks (all beverage types)

| Check | CFR | Method | Pass condition |
|---|---|---|---|
| Government Warning | 27 CFR 16.21 | Exact string match (whitespace-normalized) | Full verbatim text; `GOVERNMENT WARNING:` prefix in ALL CAPS |
| Brand Name | 27 CFR 5.22 / 4.33 / 7.22 | Fuzzy match (Levenshtein ≤ 3 on normalized strings) | Within edit distance 3 of expected; or confidence ≥ 0.6 if no expected value |
| Net Contents | Various | Presence check | Non-null value with unit |
| Class / Type Designation | Various | Presence check | Non-null value |
| Bottler / Producer | Various | Presence check | Non-null name + address |
| Label Language | 27 CFR 5.38 / 4.38 / 7.61 | Claude semantic check | All mandatory fields in English |
| Prohibited Surfaces | 27 CFR 5.38 / 4.38 / 7.61 | Claude semantic check | No mandatory info exclusively on bottom, cap, foil, or closure |

### Spirits-specific (27 CFR Part 5)

| Check | CFR | Method | Pass condition |
|---|---|---|---|
| Alcohol Content (ABV) | 27 CFR 5.37 | Presence + `%` format | Always mandatory; must contain `%` |
| Same Field of Vision | 27 CFR 5.64 | Claude layout check (threshold 0.75) | Brand name, class/type, and ABV on the same label panel |

### Wine-specific (27 CFR Part 4)

| Check | CFR | Method | Pass condition |
|---|---|---|---|
| Alcohol Content (ABV) | 27 CFR 4.36 | Conditional presence | Mandatory when wine ≥ 7% ABV |
| Country of Origin | 27 CFR 4.32(a)(3) | Presence check | Always required — even domestic wines must state the country |
| Appellation of Origin | 27 CFR 4.23 | Conditional presence | Required when a varietal name or vintage year appears |
| Sulfite Declaration | 27 CFR 4.32(b)(1) | Presence check | `NEEDS_REVIEW` when absent (requires lab test to confirm < 10 ppm) |

### Malt beverage-specific (27 CFR Part 7)

| Check | CFR | Method | Pass condition |
|---|---|---|---|
| Alcohol Content (ABV) | 27 CFR 7.71 | Optional presence | Not mandatory for standard fermentation; required only if label makes an alcohol strength claim |

### Overall status logic

| Status | Condition |
|---|---|
| **PASS** | All mandatory fields pass; no `NEEDS_REVIEW` flags |
| **REVIEW** | Any field is `NEEDS_REVIEW` (low confidence, borderline match, or ambiguous layout) |
| **FAIL** | Any mandatory field is `FAIL` |

---

## API Reference

Base path: `/api`

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/healthz` | — | `{ status: "ok" }` |
| `POST` | `/v1/labels/upload` | `multipart/form-data`: `file` (required), `backFile` (optional), `sessionId`, `expectedBrandName` | `LabelAnalysisResult` |
| `POST` | `/v1/labels/batch` | `multipart/form-data`: `files[]` (up to 50), optional `sessionId` | `BatchAnalysisResult` |
| `POST` | `/v1/labels/generate-preview` | `application/json`: `{ labelText: string }` | `{ svg: string }` |
| `GET` | `/v1/labels/session/:sessionId` | — | `BatchAnalysisResult` |
| `GET` | `/v1/labels/:labelId` | — | `LabelAnalysisResult` |
| `DELETE` | `/v1/labels/session/:sessionId` | — | `204 No Content` |

### `LabelAnalysisResult` shape

```typescript
{
  labelId: string
  sessionId: string
  fileName: string
  beverageType: "SPIRITS" | "WINE" | "MALT" | "UNKNOWN"
  overallStatus: "PASS" | "FAIL" | "REVIEW"
  confidenceScore: number          // 0–1 overall extraction confidence
  imagesAnalyzed: number           // 1 (front only) or 2 (front + back)

  // Core fields — all beverage types
  brandName: FieldResult
  classType: FieldResult
  alcoholContent: FieldResult
  netContents: FieldResult
  governmentWarning: FieldResult
  bottlerProducer: FieldResult
  labelLanguage: FieldResult
  prohibitedSurface: FieldResult

  // Conditional fields
  countryOfOrigin: FieldResult | null    // always present for WINE; import-gated for others
  sameFieldOfVision: SameFieldOfVisionResult | null  // SPIRITS only
  appellationOfOrigin: FieldResult | null            // WINE only
  sulfiteDeclaration: FieldResult | null             // WINE only

  flags: ComplianceFlag[]          // { field, severity: ERROR|WARNING|INFO, message }
  processingMs: number
  analyzedAt: string               // ISO 8601
}
```

---

## Frontend Pages

| Route | Page | Features |
|---|---|---|
| `/` | Upload | Four modes: single label (with optional back label), batch queue, generate-from-text, CSV import |
| `/results/:sessionId` | Session Dashboard | Pass/Fail/Review summary bar, filterable + sortable table, CSV export |
| `/results/:sessionId/:labelId` | Label Detail | Per-field breakdown with extracted vs. expected values; Government Warning side-by-side comparison; SFOV panel layout check; wine-specific fields (appellation, sulfite); expandable "How to Fix This" remediation cards; Approve / Issue Correction actions |

---

## CSV Import Format

The CSV Import mode accepts the following columns (header row required; extra columns ignored):

| Column | Description | Example |
|---|---|---|
| `application_id` | Your internal ID | `001` |
| `brand_name` | Brand name as it appears on the label | `OLD TOM DISTILLERY` |
| `class_type` | Class/type designation | `Kentucky Straight Bourbon Whiskey` |
| `alcohol_content` | ABV string | `45% Alc./Vol. (90 Proof)` |
| `net_contents` | Package size | `750 mL` |
| `address` | Bottler/producer address | `123 Main St Louisville KY` |
| `is_imported` | `True` or `False` | `False` |
| `country_of_origin` | Country (required for wine; fill if imported) | `France` |
| `beverage_type` | `Distilled Spirits`, `Wine`, or `Malt Beverage` | `Wine` |
| `age_statement` | Age statement text | `4 years` |
| `color_ingredients` | Coloring agents | `caramel color` |
| `commodity_statement` | Commodity statement | — |
| `sulfite_aspartame` | Sulfite / aspartame declaration | `contains sulfites` |
| `appellation` | Wine appellation of origin | `Napa Valley` |
| `foreign_wine_pct` | % wine of foreign origin | `25` |

A sample file is at `sample_data/applications.csv`.

---

## Assumptions & Trade-offs

**In-memory session store** — Sessions live in a Node.js `Map` and are lost on server restart. Acceptable for a PoC; production would use Redis or Postgres with TTL-based expiry.

**Multi-image support (front + back)** — When both label faces are uploaded, both images are sent to Claude in a single API call. This is the recommended path for any product where mandatory fields are split across panels (e.g. Government Warning on the back).

**Brand name fuzzy matching** — Levenshtein distance ≤ 3 (on lowercased, punctuation-stripped strings) handles minor OCR noise. Supply `expectedBrandName` in the upload request for tighter matching against a known COLA.

**Government Warning exact match** — Required text is normalized (whitespace collapsed) before comparison. Missing or reordered words trigger `FAIL`; line-break differences are tolerated.

**Sulfite declaration is `NEEDS_REVIEW`, not `FAIL`** — Absence doesn't automatically fail because the lab may test below the 10 ppm threshold. A human reviewer must confirm.

**Same Field of Vision confidence threshold: 0.75** — Stricter than the 0.6 global threshold because SFOV is a layout judgment call. Single-image uploads receive a `singleImageWarning` flag.

**No auth layer** — This PoC omits authentication. Production deployment would gate the tool behind SSO or API key auth.

**Claude model** — `claude-sonnet-4-6` balances accuracy and speed. `claude-opus-4-5` would improve accuracy on degraded or micro-print labels at higher cost per call.

**File size limit** — 10 MB per image (multer config). TTB submissions are typically 300 KB–2 MB JPEGs.

**CSV import is client-orchestrated** — Each CSV row is processed in sequence in the browser (generate image → convert SVG to PNG → compliance check). A production version would move this pipeline server-side with a job queue for reliability and progress persistence.

---

## Development Commands

```bash
pnpm run typecheck                              # Full typecheck across all packages
pnpm run build                                  # Typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen   # Regenerate API client from OpenAPI spec
```

---

## Extending the Compliance Engine

To add a new compliance check:

1. Add the new field to `ClaudeExtractionResult` and `LabelAnalysisResult` in `artifacts/api-server/src/lib/label-types.ts`
2. Add extraction instructions to the system prompt in `artifacts/api-server/src/lib/claude-vision.ts`
3. Implement the check in `artifacts/api-server/src/lib/compliance-engine.ts` — return a `FieldResult`
4. Add the new field to the OpenAPI spec in `lib/api-spec/openapi.yaml` and run `pnpm --filter @workspace/api-spec run codegen`
5. Display the field in `artifacts/ttb-label-review/src/pages/label-detail.tsx`
6. Add remediation steps to `artifacts/ttb-label-review/src/lib/corrections.ts`
