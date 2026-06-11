// Parses and processes label CSV/TXT files in flexible formats.
//
// Column name matching is intentionally lenient — headers are normalised to
// lowercase with non-alphanumeric chars collapsed to underscores, then
// checked against a synonym table so common variations all resolve correctly:
//
//   brand / brand_name / product_name / product  →  brandName
//   type / class / class_type / designation      →  classType
//   abv / alcohol / alcohol_content / alc        →  alcoholContent
//   volume / net_contents / size / contents      →  netContents
//   … etc.

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
  /** Raw free-form label text (takes priority over structured fields when present). */
  labelText: string;
  /** Raw back-label text (optional; submitted as backFile to the compliance API). */
  backLabelText: string;
}

// ── Synonym map ──────────────────────────────────────────────────────────────
// Key: canonical field name used in CsvLabelRow
// Value: array of normalised header strings that map to it (most specific first)
const SYNONYMS: Record<keyof CsvLabelRow, string[]> = {
  applicationId:     ["application_id", "app_id", "id", "ttb_id", "application_number", "app_number", "serial"],
  brandName:         ["brand_name", "brand", "product_name", "product", "label_name", "name"],
  classType:         ["class_type", "class", "type", "designation", "product_type", "product_class", "style", "category"],
  alcoholContent:    ["alcohol_content", "alcohol", "abv", "alc", "alcohol_by_volume", "alcohol_percentage", "proof", "abv_proof"],
  netContents:       ["net_contents", "net_content", "volume", "size", "container_size", "bottle_size", "contents", "qty", "quantity"],
  address:           ["address", "producer_address", "bottler_address", "plant_address", "location", "producer", "bottler", "bottled_by", "brewer", "distillery"],
  isImported:        ["is_imported", "imported", "import", "foreign"],
  countryOfOrigin:   ["country_of_origin", "country", "origin", "country_origin", "produced_in", "made_in"],
  beverageType:      ["beverage_type", "beverage", "type_of_beverage", "alcohol_type", "product_category", "spirit_type", "wine_type", "beer_type"],
  ageStatement:      ["age_statement", "age", "aged", "maturation", "years_aged"],
  colorIngredients:  ["color_ingredients", "color", "colour", "ingredients", "additives", "coloring", "colouring"],
  commodityStatement:["commodity_statement", "commodity", "statement"],
  sulfiteAspartame:  ["sulfite_aspartame", "sulfite", "sulphite", "sulfites", "sulphites", "aspartame"],
  appellation:       ["appellation", "appellation_of_origin", "ava", "region", "wine_region", "viticultural_area"],
  foreignWinePct:    ["foreign_wine_pct", "foreign_wine", "foreign_pct", "foreign_wine_percent", "import_pct", "blend_pct"],
  // Raw label copy columns — take priority over all structured fields
  labelText:         ["label_text", "label_copy", "front_label", "front_label_text", "raw_text", "raw_label", "label_content", "label"],
  backLabelText:     ["back_label_text", "back_label", "back_label_copy", "back_copy", "back_text"],
};

// ── Minimal RFC 4180-compliant CSV parser ─────────────────────────────────────
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

// Normalise a header string: lowercase, collapse non-alnum to underscore, trim.
function normalise(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Build a lookup map from normalised header → CsvLabelRow field name.
function buildLookup(): Map<string, keyof CsvLabelRow> {
  const map = new Map<string, keyof CsvLabelRow>();
  for (const [field, synonyms] of Object.entries(SYNONYMS) as [keyof CsvLabelRow, string[]][]) {
    for (const syn of synonyms) {
      if (!map.has(syn)) map.set(syn, field); // first match wins (most specific listed first)
    }
  }
  return map;
}

const HEADER_LOOKUP = buildLookup();

// Parse a CSV/TXT string into typed row objects, skipping the header row.
// Tolerates any column order and a wide variety of header name styles.
export function parseLabelCSV(csvText: string): CsvLabelRow[] {
  const allRows = parseCSV(csvText);
  if (allRows.length < 2) return [];

  // Map each column index → CsvLabelRow field name (or null if unrecognised)
  const colMap: (keyof CsvLabelRow | null)[] = allRows[0].map(h => {
    const key = normalise(h);
    return HEADER_LOOKUP.get(key) ?? null;
  });

  const get = (row: string[], field: keyof CsvLabelRow): string => {
    const colIdx = colMap.indexOf(field);
    return colIdx >= 0 ? (row[colIdx] ?? "").trim() : "";
  };

  return allRows.slice(1)
    .filter(row => row.some(c => c !== ""))
    .map(row => ({
      applicationId:     get(row, "applicationId"),
      brandName:         get(row, "brandName"),
      classType:         get(row, "classType"),
      alcoholContent:    get(row, "alcoholContent"),
      netContents:       get(row, "netContents"),
      address:           get(row, "address"),
      isImported:        get(row, "isImported").toLowerCase() === "true",
      countryOfOrigin:   get(row, "countryOfOrigin"),
      beverageType:      get(row, "beverageType"),
      ageStatement:      get(row, "ageStatement"),
      colorIngredients:  get(row, "colorIngredients"),
      commodityStatement:get(row, "commodityStatement"),
      sulfiteAspartame:  get(row, "sulfiteAspartame"),
      appellation:       get(row, "appellation"),
      foreignWinePct:    get(row, "foreignWinePct"),
      labelText:         get(row, "labelText"),
      backLabelText:     get(row, "backLabelText"),
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
  // If the CSV supplied a raw label_text column, use it verbatim.
  // The SVG generator understands free-form text — no reformatting needed.
  if (row.labelText?.trim()) return row.labelText.trim();

  const isWine = row.beverageType.toLowerCase().includes("wine");
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
  // Wine: always required (even domestic). Spirits/Malt: required when non-US.
  //
  // The `isImported` CSV flag is optional and often absent. Any non-US country
  // value signals a foreign product regardless of that flag, so we always
  // include country-of-origin text when a non-US value is present. This ensures
  // Claude Vision can extract it from the generated SVG and the compliance engine
  // correctly evaluates it rather than assuming a domestic product.
  const countryRaw = row.countryOfOrigin.trim();
  const isDomesticCountry = !countryRaw || /^(us|usa|united\s+states?)$/i.test(countryRaw);

  if (!isDomesticCountry) {
    // "Product of Scotland" / "Product of France" is the standard TTB format
    // for country-of-origin declarations on imported spirit and malt labels.
    lines.push(`Product of ${countryRaw}`);
  } else if (isWine) {
    lines.push(`Country of Origin: ${countryRaw || "United States"}`);
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
