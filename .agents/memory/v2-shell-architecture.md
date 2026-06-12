---
name: V2 Government Shell Architecture
description: How the V2 UI shell (AppShell + WizardBar + HelpBar) is wired together and key design decisions.
---

## Pattern

App.tsx wraps everything in: AppShell → WizardBar → main > [routes] → HelpBar

- **AppShell** (`src/components/app-shell.tsx`) — fixed 240px dark navy left sidebar. Uses inline style `hsl(var(--sidebar))` not Tailwind classes because the sidebar CSS vars are dark navy in light mode (overriding default white). Nav hover states use onMouseEnter/Leave for the same reason.
- **WizardBar** (`src/components/wizard-bar.tsx`) — 3-step bar at top of main area. Step derived from route: `/` → step 1, `/results/*` or `/all-results` → step 3.
- **HelpBar** (`src/components/help-bar.tsx`) — fixed bottom strip with `left: 240px` to align with main content. Contextual chips change by route.

## CSS tokens added (light mode :root)
- `--sidebar: 214 47% 13%` — dark navy (overrides the default white sidebar)
- `--sidebar-foreground: 210 20% 88%`
- `--sidebar-border: 214 47% 20%`
- `--sidebar-primary: 214 100% 55%` — active nav item background
- `--gold: 43 74% 55%` — TTB shield accent color
- `--color-gold: hsl(var(--gold))` in @theme inline block

**Why:** The sidebar is intentionally dark navy in both light and dark mode (government agency aesthetic). Using inline HSL styles for sidebar-specific colors avoids Tailwind purging issues.

## Home page two-panel layout
`upload.tsx` renders as two panels:
- Left (420px fixed width, `border-r`): Mode cards + inline form expansion + CTA
- Right (flex-1): `RecentResultsPanel` component that fetches current session via `useGetSessionResults`

The four upload modes (single/batch/generate/csv) all live in one page; clicking a card changes `mode` state and expands that card's form inline.

## Routes
- `/` = Upload (home, two-panel)
- `/all-results` = AllResultsPage (cross-session with session selector pills)
- `/manage` = ManagePage (renamed "My Batches")
- `/results/:sessionId` = ResultsPage
- `/results/:sessionId/:labelId` = LabelDetailPage
- `/help` = HelpPage
