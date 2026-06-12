# TTB Label Review — Project Deliverable

**Prepared by:** Fulton Q.
**Date:** June 12, 2026
**Classification:** Internal / Proof of Concept

---

## Table of Contents

1. [Introduction and Problem Statement](#1-introduction-and-problem-statement)
2. [The Solution](#2-the-solution)
3. [Setup and Run Instructions](#3-setup-and-run-instructions)
4. [User Guide](#4-user-guide)
5. [Implementation Framework](#5-implementation-framework)
6. [Project File Structure](#6-project-file-structure)
7. [Key Files in Detail](#7-key-files-in-detail)

---

## 1. Introduction and Problem Statement

### Background

The Alcohol and Tobacco Tax and Trade Bureau (TTB) is the federal agency responsible for ensuring that alcohol beverages sold in the United States carry labels that comply with strict mandatory requirements. These requirements are codified in the Code of Federal Regulations (CFR) under three parts:

- **27 CFR Part 4** — Wine
- **27 CFR Part 5** — Distilled Spirits
- **27 CFR Part 7** — Malt Beverages (Beer, Ale, Lager, etc.)

Every bottle of wine, spirits, or beer sold in the United States must bear a label approved by the TTB through a process called a Certificate of Label Approval (COLA). Label reviewers at the TTB must examine each submitted label and verify that it contains all required fields, uses the correct statutory wording, and meets placement rules — before the product may be sold legally.

### The Problem

Label review is a high-volume, labor-intensive process. Reviewers must manually inspect each label image and cross-reference it against a detailed regulatory checklist that varies by beverage type. The volume of COLA submissions is large and growing, while the regulatory checklist — though well-defined — requires repetitive, rule-based verification that is both time-consuming and prone to human error under sustained workload.

Common compliance failures that must be caught during review include:

- Missing mandatory fields (brand name, class/type designation, net contents, alcohol content, bottler/producer address)
- Government Health Warning Statement text that deviates even slightly from the exact statutory wording required by 27 CFR 16.21
- Spirits labels that fail the same-field-of-vision requirement (brand name, ABV, and class/type must all appear on the same panel without the consumer having to rotate the bottle)
- Wine labels missing a country of origin or a required appellation of origin
- Wine varietal blend percentages that do not sum to 100%
- Prohibited label placement (e.g., Government Warning printed on the bottom of the bottle or on the cap)

Catching all of these issues consistently, across hundreds of submissions, is the core operational challenge.

---

## 2. The Solution

### Overview

The **TTB Label Review** application is an AI-powered compliance screening tool built as a Proof of Concept (PoC). It allows TTB reviewers to upload a label image (or a batch of label images) and receive an instant, field-by-field compliance report — identifying which requirements pass, which fail, and which require human follow-up review.

### How It Works

The system uses a two-stage pipeline designed to keep AI and compliance logic strictly separated:

1. **AI Extraction (Claude Vision)** — Anthropic's Claude vision model reads the label image and extracts the raw text values for each required field, exactly as they appear on the label. Claude does not make compliance decisions; it only reads and reports what it sees, along with a confidence score for each field.

2. **Compliance Engine (TypeScript)** — A deterministic rules engine written in TypeScript applies the actual regulatory requirements to the extracted values. Every pass/fail decision is made by auditable code — not by the AI. This means the compliance logic can be inspected, tested, and updated by legal or technical staff without touching the AI layer.

### Key Design Decisions

| Decision | Rationale |
|---|---|
| Claude extracts; engine decides | Keeps compliance rules auditable and legally defensible. AI output is never trusted as a compliance verdict. |
| Confidence scoring | Fields Claude is uncertain about (below 60% confidence) are escalated to NEEDS REVIEW rather than PASS or FAIL, flagging them for human verification. |
| Multi-image support | Front and back label panels are submitted together in a single AI call, allowing fields like the Government Warning (typically on the back) and the brand name (typically on the front) to be evaluated together. |
| In-memory session store | For this PoC, results are stored in server memory during the review session. No database is used, keeping the system lightweight and easy to deploy. |

### Compliance Checks Performed

The engine checks the following fields for every submission:

| Field | Spirits | Wine | Malt |
|---|---|---|---|
| Brand Name | Required | Required | Required |
| Class / Type Designation | Required | Required | Required |
| Alcohol Content (ABV) | Required | Required if ≥7% ABV | Not required (unless label makes a strength claim) |
| Net Contents | Required | Required | Required |
| Government Warning Statement | Required | Required | Required |
| Bottler / Producer Name & Address | Required | Required | Required |
| Country of Origin | Domestic: not required; Imported: required | Always required | Domestic: not required; Imported: required |
| Same Field of Vision (brand + ABV + class on same panel) | Required (27 CFR 5.64) | Not applicable | Not applicable |
| Appellation of Origin | Not applicable | Required when varietal or vintage is stated | Not applicable |
| Sulfite Declaration | Not applicable | Required when sulfites ≥10 ppm | Not applicable |
| Varietal Blend Percentages | Not applicable | Must sum to 100% (±0.6%) | Not applicable |

### Output

Each submission receives one of three verdicts:

- **PASS** — All mandatory fields are present and compliant.
- **FAIL** — One or more mandatory fields are missing or do not meet regulatory requirements. Specific violations are listed with the relevant CFR citation.
- **NEEDS REVIEW** — One or more fields were detected but could not be read with sufficient confidence, or the finding is ambiguous. A human reviewer must verify the flagged fields before a final determination is made.

---

## 3. Setup and Run Instructions

This section is for developers or technical staff who need to run the application locally or deploy it to a server.

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 24 LTS |
| pnpm | 10+ |
| Anthropic API access | Claude claude-sonnet-4-6 (or Replit Anthropic integration) |

### Environment Variables

Create a `.env` file in the project root (or set these as system environment variables):

| Variable | Required | Description |
|---|---|---|
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Yes | Anthropic API base URL. Auto-set by Replit; for local dev use `https://api.anthropic.com` |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Yes | Your Anthropic API key. Auto-set by Replit integration. |
| `SESSION_SECRET` | Yes | Any random string (e.g. output of `openssl rand -hex 32`). Signs Express session cookies. |

### Running Locally

```bash
# 1. Install dependencies
pnpm install

# 2. Start the API server (terminal 1)
pnpm --filter @workspace/api-server run dev
# API is available at http://localhost:8080/api

# 3. Start the React frontend (terminal 2)
pnpm --filter @workspace/ttb-label-review run dev
# Frontend is available at http://localhost:5173
```

Both services must be running simultaneously. The frontend calls the API at `/api` (proxied by Vite in development).

### Running on Replit

Open the project in Replit. Both workflows (`API Server` and `web`) start automatically. The Anthropic integration is pre-wired — no API key configuration is needed.

### Building for Production

```bash
# Typecheck + build all packages
pnpm run build

# The API server bundle is output to:
#   artifacts/api-server/dist/index.mjs
#
# The React frontend bundle is output to:
#   artifacts/ttb-label-review/dist/public/
#
# In production, the Express server serves the React bundle as static files.
# Start with:
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

### Regenerating API Client Code

If you change `lib/api-spec/openapi.yaml`, regenerate the TypeScript client and Zod validators:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Never edit files inside `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/` by hand — they are overwritten by codegen.

---

## 4. User Guide

This guide is written for all reviewers who will use the TTB Label Review tool. No technical background is needed. If you can use a web browser, you can use this tool.

---

### Getting Started

Open the application in your web browser. You will see the main upload page. At the top of the page you will see the name of your current review session.

> **What is a session?** A session is a group of labels you review together. All the results from your current session appear in one place. When you are ready to start a brand-new review, click **New Session** to clear out the previous results.

---

### Step 1 — Choose How to Submit a Label

The tool offers four ways to submit labels. Choose the one that fits your situation.

---

#### Option A: One Label

Use this when you have a single label image to check.

1. Click the **One Label** tab.
2. Drag and drop your label image file into the gray box, **or** click the box and browse to the file on your computer. Accepted file types: JPG, PNG, WebP, GIF.
3. If the product has a back label (for example, the Government Warning is on the back), turn on the **Include back label** toggle and upload the back panel image as well.
4. Fill in the **Expected Brand Name** field if you want the system to verify the brand name matches a specific value. This is optional but recommended.
5. Click **Check Compliance**.
6. Wait a few seconds. The system will analyze the label and display results automatically.

---

#### Option B: Multiple Labels (Batch)

Use this when you have several label images to check in one go.

1. Click the **Multiple Labels** tab.
2. Add each label image one at a time using the upload area, or drag several files in at once.
3. Click **Run Batch Check** when all files have been added.
4. The tool will process each label in sequence. A progress indicator will show which labels have been checked and which are still pending.
5. When finished, all results appear together on the results page.

---

#### Option C: Generate a Label Image

Use this when you have the label text (but not an image) and want to check whether that text would be compliant.

1. Click the **Generate Label Image** tab.
2. Paste or type the label text into the text box. Include all fields as they would appear on the physical label.
3. Click **Generate & Check**. The system will create a label image from the text and immediately run the compliance check on it.
4. You can view the generated label image alongside the compliance results.

---

#### Option D: CSV Import (Batch from Spreadsheet)

Use this when you have a spreadsheet of label applications to process all at once.

1. Click the **CSV Import** tab.
2. Upload your CSV file (this should be in the standard TTB applications format).
3. The tool will read each row, generate a label image for it, and run compliance checks automatically — row by row.
4. All results are collected into one session report when the batch is complete.

---

### Step 2 — Reading the Results

After submitting, the results page shows a summary at the top:

- **Green (PASS)** — The label meets all checked requirements.
- **Red (FAIL)** — One or more required items are missing or incorrect. Click the label name to see exactly which items failed and why.
- **Yellow (NEEDS REVIEW)** — The system could not read one or more fields clearly enough to make a determination. A human reviewer must inspect those fields.

Below the summary, a table lists every label in the session with its overall verdict. You can:
- **Filter** the table by status (Pass / Fail / Review) using the buttons above the table.
- **Click any row** to open the full detail page for that label.
- **Export to CSV** to download the full session results as a spreadsheet.

---

### Step 3 — Label Detail Page

Click on any label in the results table to open its detail page. This page shows:

- A preview of the label image.
- A row for each compliance field, with its status (Pass / Fail / Needs Review), the value extracted from the label, and the confidence score.
- For failures, an expandable **How to Fix This** card explains exactly what needs to be corrected and references the relevant CFR regulation.
- A side-by-side comparison of the Government Warning text extracted from the label versus the exact statutory wording required by law.

---

### Tips for Best Results

- **Use clear, high-resolution images.** Blurry or low-contrast images will reduce the AI's confidence and may generate more NEEDS REVIEW flags.
- **Submit front and back panels together** when the Government Warning is on the back label.
- **Fill in the Expected Brand Name** when you know the registered COLA name — this enables an exact brand name verification.
- **Session results are temporary.** Export your results to CSV before closing the browser or refreshing the page, as data is not saved permanently in this PoC version.

---

## 5. Implementation Framework

### Technology Stack

The application is built on the following technologies:

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 24 |
| Language | TypeScript | 5.9 |
| Package Manager | pnpm (workspaces) | 10.26.1 |
| Backend Framework | Express | 5 |
| AI Model | Anthropic Claude (claude-sonnet-4-6) | via API |
| Frontend Framework | React | 19 |
| Frontend Build Tool | Vite | 7 |
| Frontend Styling | Tailwind CSS | 4 |
| UI Component Library | shadcn/ui | — |
| Data Fetching (frontend) | TanStack Query | 5 |
| Client-side Routing | Wouter | 3 |
| File Upload Handling | Multer | — |
| Server Logging | Pino | — |
| API Contract | OpenAPI 3.1 → Orval codegen | — |

### Why This Stack Was Chosen

**TypeScript end-to-end.** Using TypeScript on both the server (Express) and the client (React) means that the data types flowing between the AI extraction, the compliance engine, the API, and the user interface are all checked at compile time. This reduces an entire class of runtime bugs that are especially costly in a compliance context.

**Express 5.** A mature, minimal HTTP server framework. Express adds almost no overhead or abstraction, making it straightforward to read, audit, and extend. The compliance-critical business logic sits in plain TypeScript modules, not hidden inside framework conventions.

**React 19 + Vite 7.** React is the dominant standard for data-driven web UIs. Vite provides near-instant development builds and a production bundle optimized for fast load times. Together they allow the results dashboard — with its dynamic filtering, expandable cards, and real-time batch progress — to be built with minimal boilerplate.

**Anthropic Claude (claude-sonnet-4-6).** Claude's vision capability was selected for its strong performance on structured document extraction tasks. The extraction prompt instructs Claude to return verbatim text for every field and a numeric confidence score — giving the compliance engine the raw material it needs to make legally grounded decisions without relying on the AI to interpret regulations.

**OpenAPI-first API design.** The API contract is defined in a single `openapi.yaml` file. Client-side React Query hooks and Zod validation schemas are automatically generated from it using Orval. This means the server and client can never fall out of sync on field names, types, or endpoint shapes, and API changes are reflected automatically in the frontend after a single codegen run.

**pnpm workspaces (monorepo).** All packages — the API server, the React frontend, shared type libraries, and the API spec — live in one repository managed by pnpm. This eliminates version drift between packages and makes it possible to typecheck the entire system with a single command.

**Single-service deployment.** In production, the Express server also serves the pre-built React frontend as static files. This simplifies deployment to a single Render Web Service with no separate CDN or static hosting configuration needed for the PoC.

### Development Process

The project was built contract-first:

1. **Define the API shape** in `lib/api-spec/openapi.yaml`. Every field the frontend needs from the backend — analysis results, field statuses, confidence scores — was specified in the OpenAPI schema before any code was written.

2. **Generate client code** from the spec using `pnpm --filter @workspace/api-spec run codegen`. This produced type-safe React Query hooks and Zod validators automatically.

3. **Build the compliance engine** (`compliance-engine.ts`) as a pure TypeScript module with no external dependencies. Each CFR requirement is implemented as a standalone, testable function. The engine takes extracted AI output and emits structured pass/fail results with CFR citations attached.

4. **Build the Claude Vision layer** (`claude-vision.ts`) as the sole interface between the application and the Anthropic API. The extraction prompt was refined iteratively to handle edge cases: multi-panel labels, sulfite declarations embedded inside Government Warning text blocks, varietal blend percentages mixed with appellations, and the many variant formats used for ABV declarations across different beverage types.

5. **Build the React frontend** against the generated hooks. The upload page, results dashboard, and label detail page consume the API through the generated TanStack Query hooks, which handle loading states, error states, and cache invalidation automatically.

6. **Deploy to Render** as a single Node.js Web Service. The build step compiles both the React bundle and the Express server; the Express server then serves the React bundle as static files in production.

---

## 6. Project File Structure

```
workspace/                          ← Monorepo root
│
├── package.json                    ← Root scripts; packageManager pin (pnpm@10.26.1)
├── pnpm-workspace.yaml             ← Workspace package discovery; dependency catalog;
│                                      onlyBuiltDependencies security list
├── tsconfig.base.json              ← Shared TypeScript strict defaults
├── tsconfig.json                   ← Root TypeScript solution file (libs only)
│
├── artifacts/
│   ├── api-server/                 ← Express API server (deployed to Render)
│   │   ├── build.mjs               ← esbuild bundle script (produces dist/index.mjs)
│   │   └── src/
│   │       ├── index.ts            ← Entry point; starts HTTP server
│   │       ├── app.ts              ← Express app setup; static file serving in production
│   │       ├── routes/
│   │       │   ├── index.ts        ← Mounts all route modules under /api
│   │       │   ├── labels.ts       ← /upload, /generate-preview, /sessions/:id endpoints
│   │       │   └── health.ts       ← GET /api/healthz
│   │       └── lib/
│   │           ├── compliance-engine.ts  ← All TTB compliance rules (see Section 6)
│   │           ├── claude-vision.ts      ← Claude Vision extraction prompt and API call
│   │           ├── label-analyzer.ts     ← Orchestrates Vision → Engine pipeline
│   │           ├── label-generator.ts    ← Generates SVG label images from plain text
│   │           ├── label-types.ts        ← Shared TypeScript interfaces
│   │           ├── session-store.ts      ← In-memory Map<sessionId, results[]>
│   │           └── logger.ts             ← Pino logger singleton
│   │
│   └── ttb-label-review/           ← React frontend (served as static files in production)
│       ├── vite.config.ts          ← Vite build config; outputs to dist/public
│       └── src/
│           ├── App.tsx             ← Root component; Wouter router
│           ├── main.tsx            ← React root; TanStack Query provider
│           ├── pages/
│           │   ├── upload.tsx      ← Main upload page; all four submission modes
│           │   ├── results.tsx     ← Session results dashboard; filter + CSV export
│           │   ├── label-detail.tsx← Per-label field breakdown + remediation cards
│           │   ├── manage.tsx      ← Session history management page
│           │   └── not-found.tsx   ← 404 fallback
│           └── lib/
│               ├── corrections.ts  ← Per-field "How to Fix This" remediation text
│               ├── csv-export.ts   ← Exports session results to CSV download
│               ├── csv-label.ts    ← Parses applications.csv; formats rows as label text
│               ├── session-history.ts ← Manages active session ID in localStorage
│               ├── print-report.ts ← Generates printable HTML report
│               └── review-actions.ts  ← Shared helpers for review UI interactions
│
├── lib/
│   ├── api-spec/
│   │   ├── openapi.yaml            ← Source of truth for all API contracts
│   │   └── orval.config.ts         ← Codegen config (outputs hooks + Zod schemas)
│   ├── api-client-react/
│   │   └── src/generated/          ← DO NOT EDIT — auto-generated React Query hooks
│   ├── api-zod/
│   │   └── src/generated/          ← DO NOT EDIT — auto-generated Zod validators
│   └── integrations-anthropic-ai/
│       └── src/
│           ├── client.ts           ← Anthropic client (supports both Replit + standard API keys)
│           └── index.ts            ← Exports anthropic client instance
│
└── sample_data/
    └── applications.csv            ← Sample CSV file for testing CSV Import mode
```

---

## 7. Key Files in Detail

### `compliance-engine.ts`

**Location:** `artifacts/api-server/src/lib/compliance-engine.ts`
**Size:** ~808 lines

This is the core of the compliance system. It is a pure TypeScript module — no external dependencies, no network calls — containing every regulatory rule the system enforces. Each CFR requirement is implemented as a dedicated function. The main export, `runComplianceCheck()`, calls each rule function in sequence and assembles the final structured result.

Key functions inside this file:

| Function | What it checks |
|---|---|
| `matchBrandName()` | Fuzzy brand name matching using Levenshtein edit distance. Exact match → PASS; distance ≤3 → NEEDS REVIEW; distance >3 → FAIL. |
| `checkGovernmentWarning()` | Verbatim comparison of the extracted warning text against the statutory wording of 27 CFR 16.21 (case-insensitive). Also checks for prohibited placement (bottom, cap, foil capsule). |
| `checkAbv()` | Verifies ABV is present for spirits (always) and wine ≥7% ABV. Marks malt beverages as not required unless the label makes a strength claim. |
| `checkSameFieldOfVision()` | Spirits-only. Verifies brand name, class/type, and ABV all appear on the same label panel without the consumer needing to rotate the bottle (27 CFR 5.64). |
| `checkCountryOfOrigin()` | Wine: always required. Imported spirits/malt: required. Domestic spirits/malt: not required. |
| `checkAppellation()` | Wine-only. Required when a varietal name or vintage year is present on the label. |
| `checkSulfites()` | Wine-only. Checks for a sulfite declaration when sulfites ≥10 ppm are indicated. Absence escalates to NEEDS REVIEW (lab confirmation required) rather than FAIL. |
| `checkVarietalBlendPercentages()` | Wine-only. Parses percentage values from the class/type string and verifies they sum to 100% within ±0.6% tolerance (27 CFR 4.23(d)). |

**Key constants:**

```
CONFIDENCE_THRESHOLD      = 0.6   (fields below this → NEEDS REVIEW)
SFOV_CONFIDENCE_THRESHOLD = 0.75  (stricter; panel layout is harder to assess)
LEVENSHTEIN_THRESHOLD     = 3     (brand name fuzzy match tolerance)
```

---

### `claude-vision.ts`

**Location:** `artifacts/api-server/src/lib/claude-vision.ts`
**Size:** ~173 lines

This file contains the single interface between the application and the Anthropic Claude API. It has two responsibilities:

1. **The extraction prompt** — A detailed system prompt that instructs Claude to read the label image and return a specific JSON structure containing every required field with its verbatim value and a confidence score. The prompt explicitly instructs Claude not to paraphrase, correct, or interpret the text — it must return exactly what is printed on the label.

2. **The API call** — Accepts one or two label images (front and back panels), encodes them as base64, and sends them to Claude in a single API call. Claude is instructed to consider fields across both images when two are provided.

The returned JSON is validated against the `ClaudeExtractionResult` TypeScript interface before being passed to the compliance engine.

---

### `label-analyzer.ts`

**Location:** `artifacts/api-server/src/lib/label-analyzer.ts`

The orchestration layer. Accepts one or two label images, calls `claude-vision.ts` to extract fields, then passes the extraction result to `compliance-engine.ts` to produce the final structured compliance report. This is the only file that imports from both modules; it exists to keep the Vision layer and the Engine layer cleanly separated.

---

### `app.ts`

**Location:** `artifacts/api-server/src/app.ts`

Configures the Express application. In development, it serves only the `/api` routes. In production (on Render), it additionally serves the pre-built React frontend as static files from `artifacts/ttb-label-review/dist/public`, and adds an SPA fallback route (`/{*path}`) so that client-side navigation within the React app works correctly regardless of which URL the user refreshes on.

---

### `labels.ts` (routes)

**Location:** `artifacts/api-server/src/routes/labels.ts`

Contains the three main API endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /api/upload` | Accepts one or two label image files; runs the full analysis pipeline; stores the result in the session store; returns the compliance report. |
| `POST /api/generate-preview` | Accepts label text; generates an SVG label image using `label-generator.ts`; returns the SVG. Used by the Generate Label and CSV Import modes. |
| `GET /api/sessions/:sessionId` | Returns all analysis results stored for the given session ID. |

---

### `upload.tsx`

**Location:** `artifacts/ttb-label-review/src/pages/upload.tsx`
**Size:** ~1,275 lines

The main user-facing page. Implements all four submission modes (One Label, Multiple Labels, Generate Label Image, CSV Import) as tabs within a single component. Manages a shared active session ID stored in `localStorage` so that all results from a working session — regardless of which upload mode was used — appear together in one results view. Handles the full CSV Import pipeline client-side: reading the CSV, formatting each row as label text, calling the generate-preview endpoint to produce an SVG, converting the SVG to a PNG in a browser canvas element, and uploading the PNG to the analysis endpoint.

---

### `corrections.ts`

**Location:** `artifacts/ttb-label-review/src/lib/corrections.ts`

A lookup table mapping each compliance field name to a user-friendly remediation guide. When a field result is FAIL or NEEDS REVIEW on the label detail page, the corresponding entry from this file is displayed in an expandable "How to Fix This" card. Each entry contains a plain-language title and a numbered list of corrective steps referencing the relevant CFR provision.

---

### `openapi.yaml`

**Location:** `lib/api-spec/openapi.yaml`

The single source of truth for all data contracts between the server and the client. Every field in a compliance result — brand name status, confidence score, failure reason, Government Warning match, SFOV result, appellation, sulfite declaration — is defined here. The React Query hooks and Zod validators used by the frontend are generated automatically from this file and must never be edited by hand.

---

*End of Document*
