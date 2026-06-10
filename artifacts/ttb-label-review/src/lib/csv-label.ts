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

// Convert a parsed CSV row into the natural-language label description text sent to the
// generate-preview API. Claude's label-generator uses this text to produce a realistic SVG label.
//
// Design rules:
//  - Only include fields that have values — Claude infers missing fields are absent.
//  - Always include the Government Warning; it is mandatory on every label.
//  - Beverage type is stated explicitly so Claude picks the right visual style.
//  - Wine labels include appellation and sulfite declaration prominently.
//  - Imported product section appears only when is_imported = true.
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

  const typeLabel = isWine ? "Wine" : isSpirits ? "Distilled Spirits" : isMalt ? "Beer/Malt Beverage" : row.beverageType || "Alcohol Beverage";

  const lines: string[] = [
    `TTB LABEL APPLICATION — ${typeLabel.toUpperCase()}`,
    "",
    `BRAND NAME: ${row.brandName || "(unknown)"}`,
    `CLASS/TYPE: ${row.classType || "(not specified)"}`,
  ];

  if (row.alcoholContent) lines.push(`ALCOHOL CONTENT: ${row.alcoholContent}`);
  if (row.netContents) lines.push(`NET CONTENTS: ${row.netContents}`);

  const bottlerLine = [row.brandName, row.address].filter(Boolean).join(", ");
  if (bottlerLine) {
    const prefix = isWine ? "Bottled by" : isSpirits ? "Bottled by" : "Brewed and Bottled by";
    lines.push(`${prefix}: ${bottlerLine}`);
  }

  // Country of origin — always required for wine, required when imported for spirits/malt
  if (row.isImported && row.countryOfOrigin) {
    lines.push(`IMPORTED FROM: ${row.countryOfOrigin}`);
  } else if (isWine) {
    lines.push(`COUNTRY OF ORIGIN: ${row.countryOfOrigin || "United States"}`);
  }

  // Wine-specific fields
  if (isWine && row.appellation) {
    lines.push(`APPELLATION OF ORIGIN: ${row.appellation}`);
  }
  if (isWine && row.foreignWinePct) {
    lines.push(`Contains ${row.foreignWinePct}% wine of foreign origin`);
  }

  // Optional fields present on many labels
  if (row.ageStatement) lines.push(`AGE STATEMENT: Aged ${row.ageStatement}`);
  if (row.colorIngredients) lines.push(`COLORING AGENTS: ${row.colorIngredients}`);
  if (row.sulfiteAspartame) lines.push(`DECLARATION: ${row.sulfiteAspartame}`);
  if (row.commodityStatement) lines.push(`COMMODITY STATEMENT: ${row.commodityStatement}`);

  lines.push("");
  lines.push(GOV_WARNING);

  return lines.join("\n");
}
