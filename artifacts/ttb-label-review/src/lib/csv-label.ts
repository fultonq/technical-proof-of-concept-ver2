// Parses and processes the TTB applications CSV format.
//
// Expected CSV columns (header row required):
//   application_id, brand_name, class_type, alcohol_content, net_contents,
//   address, is_imported, country_of_origin, beverage_type, age_statement,
//   color_ingredients, commodity_statement, sulfite_aspartame, appellation,
//   foreign_wine_pct

export interface CsvLabelRow {
  applicationId: string;
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  address: string;
  isImported: boolean;
  countryOfOrigin: string;
  beverageType: string;
  ageStatement: string;
  colorIngredients: string;
  commodityStatement: string;
  sulfiteAspartame: string;
  appellation: string;
  foreignWinePct: string;
}

// Minimal RFC 4180-compliant CSV parser. Handles quoted fields with embedded commas/newlines.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field.trim());
        field = "";
      } else if (ch === "\r" && text[i + 1] === "\n") {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = "";
        i += 2;
        continue;
      } else if (ch === "\n") {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }
    i++;
  }
  if (field || row.length > 0) {
    row.push(field.trim());
    if (row.some(c => c !== "")) rows.push(row);
  }
  return rows;
}

// Parse a CSV string into typed row objects, skipping the header row.
export function parseLabelCSV(csvText: string): CsvLabelRow[] {
  const allRows = parseCSV(csvText);
  if (allRows.length < 2) return [];

  const headers = allRows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, "_"));
  const idx = (name: string) => headers.indexOf(name);

  const get = (row: string[], name: string): string => {
    const i = idx(name);
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };

  return allRows.slice(1).filter(row => row.some(c => c !== "")).map(row => ({
    applicationId: get(row, "application_id"),
    brandName: get(row, "brand_name"),
    classType: get(row, "class_type"),
    alcoholContent: get(row, "alcohol_content"),
    netContents: get(row, "net_contents"),
    address: get(row, "address"),
    isImported: get(row, "is_imported").toLowerCase() === "true",
    countryOfOrigin: get(row, "country_of_origin"),
    beverageType: get(row, "beverage_type"),
    ageStatement: get(row, "age_statement"),
    colorIngredients: get(row, "color_ingredients"),
    commodityStatement: get(row, "commodity_statement"),
    sulfiteAspartame: get(row, "sulfite_aspartame"),
    appellation: get(row, "appellation"),
    foreignWinePct: get(row, "foreign_wine_pct"),
  }));
}

// Government warning required on all US alcohol labels (27 CFR Part 16).
const GOV_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink " +
  "alcoholic beverages during pregnancy because of the risk of birth defects. " +
  "(2) Consumption of alcoholic beverages impairs your ability to drive a car or " +
  "operate machinery, and may cause health problems.";

// Convert a parsed CSV row into natural-language label copy sent to the generate-preview API.
//
// Format philosophy — mirrors how a real label reads, NOT a structured form:
//   • Brand name is the first/most prominent line (no "BRAND NAME:" prefix)
//   • Class/type designation directly below the brand
//   • ABV and net contents as they appear on the physical label
//   • Bottler/producer line in standard TTB format
//   • Wine-specific fields (appellation, sulfite) appear naturally
//   • Government Warning at the bottom, verbatim
//
// This "label-like" format causes Claude's SVG generator to produce a realistic
// label image where each field occupies its proper visual position, which in turn
// makes Claude Vision extraction more reliable during compliance checking.
export function rowToLabelText(row: CsvLabelRow): string {
  const isWine = row.beverageType.toLowerCase().includes("wine");
  const isSpirits =
    row.beverageType.toLowerCase().includes("spirit") ||
    row.beverageType.toLowerCase().includes("distilled");
  const isMalt =
    row.beverageType.toLowerCase().includes("malt") ||
    row.beverageType.toLowerCase().includes("beer") ||
    row.beverageType.toLowerCase().includes("ale") ||
    row.beverageType.toLowerCase().includes("lager");

  const lines: string[] = [];

  // ── Brand name — most prominent element on the label ────────────────────
  lines.push(row.brandName || "(Brand Name)");

  // ── Class / type designation ─────────────────────────────────────────────
  if (row.classType) lines.push(row.classType);

  lines.push("");

  // ── Core mandatory fields ────────────────────────────────────────────────
  if (row.alcoholContent) lines.push(row.alcoholContent);
  if (row.netContents)    lines.push(`Net Contents: ${row.netContents}`);
  if (row.ageStatement)   lines.push(`Aged ${row.ageStatement}`);

  lines.push("");

  // ── Bottler / producer line ──────────────────────────────────────────────
  const bottlerParts = [row.brandName, row.address].filter(Boolean);
  if (bottlerParts.length > 0) {
    const prefix = isMalt ? "Brewed and Bottled by" : "Bottled by";
    lines.push(`${prefix}: ${bottlerParts.join(", ")}`);
  }

  // ── Country of origin ────────────────────────────────────────────────────
  // Wine: always required (even domestic). Spirits/Malt: only when imported.
  if (row.isImported && row.countryOfOrigin) {
    lines.push(`Imported from ${row.countryOfOrigin}`);
  } else if (isWine) {
    lines.push(`Country of Origin: ${row.countryOfOrigin || "United States"}`);
  }

  // ── Wine-specific fields ─────────────────────────────────────────────────
  if (isWine && row.appellation)    lines.push(`Appellation of Origin: ${row.appellation}`);
  if (isWine && row.foreignWinePct) lines.push(`Contains ${row.foreignWinePct}% wine of foreign origin`);

  // ── Optional declarations ────────────────────────────────────────────────
  if (row.colorIngredients)   lines.push(`Contains: ${row.colorIngredients}`);
  if (row.sulfiteAspartame)   lines.push(row.sulfiteAspartame);
  if (row.commodityStatement) lines.push(row.commodityStatement);

  lines.push("");
  lines.push(GOV_WARNING);

  return lines.join("\n");
}
