import { inflateRawSync } from "node:zlib";
import { boqUnits, parseBoq } from "@/lib/boq";
import type { BoqInput } from "@/types";

export interface ImportRow {
  rowNumber: number;
  raw: Record<string, string>;
  data: Partial<BoqInput> | null;
  errors: string[];
  warnings: string[];
  selected: boolean;
}

export interface ImportPreview {
  fileName: string;
  format: "xlsx" | "csv";
  headers: string[];
  rows: ImportRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

const MAX_IMPORT_ROWS = 500;

function normHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const HEADER_ALIASES: Record<string, keyof BoqInput | "ignore"> = {
  code: "code",
  itemcode: "code",
  boqcode: "code",
  item: "code",
  no: "code",
  description: "description",
  itemdescription: "description",
  desc: "description",
  unit: "unit",
  uom: "unit",
  estimatedqty: "estimatedQty",
  estqty: "estimatedQty",
  qtyest: "estimatedQty",
  quantityestimated: "estimatedQty",
  estimatedquantity: "estimatedQty",
  qty: "estimatedQty",
  quantity: "estimatedQty",
  actualqty: "actualQty",
  qtyactual: "actualQty",
  measuredqty: "actualQty",
  actualquantity: "actualQty",
  unitrate: "unitRate",
  rate: "unitRate",
  unitprice: "unitRate",
  price: "unitRate",
};

function mapHeaders(headers: string[]): (keyof BoqInput | null)[] {
  return headers.map((h) => {
    const key = HEADER_ALIASES[normHeader(h)];
    if (!key || key === "ignore") return null;
    return key;
  });
}

function parseNumber(value: string): number {
  const cleaned = value.replace(/,/g, "").trim();
  if (cleaned === "") return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* ignore */ }
      else field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

type ZipEntry = { name: string; compression: number; compressedSize: number; uncompressedSize: number; localOffset: number };

function readZipEntries(buf: Buffer): ZipEntry[] {
  // Find EOCD (search last 64k)
  let eocd = -1;
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Invalid XLSX file.");
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  const end = cdOffset + cdSize;
  while (p + 46 <= end && p + 46 <= buf.length) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const compression = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.push({ name, compression, compressedSize, uncompressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const p = entry.localOffset;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error("Invalid XLSX entry.");
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const dataStart = p + 30 + nameLen + extraLen;
  const data = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compression === 0) return Buffer.from(data);
  if (entry.compression === 8) return inflateRawSync(data);
  throw new Error(`Unsupported XLSX compression (${entry.compression}).`);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const si = m[1] ?? "";
    const texts: string[] = [];
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(si))) texts.push(decodeXmlEntities(t[1] ?? ""));
    out.push(texts.join(""));
  }
  return out;
}

function colIndex(ref: string): number {
  const letters = (ref.match(/[A-Z]+/i) ?? ["A"])[0]!.toUpperCase();
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

function parseSheetRows(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const rowXml = rm[1] ?? "";
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowXml))) {
      const attrs = cm[1] ?? cm[3] ?? "";
      const body = cm[2] ?? "";
      const ref = (attrs.match(/\br="([^"]+)"/) ?? [])[1] ?? "";
      const t = (attrs.match(/\bt="([^"]+)"/) ?? [])[1] ?? "";
      const idx = ref ? colIndex(ref) : cells.length;
      let value = "";
      if (t === "inlineStr") {
        const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let tm: RegExpExecArray | null;
        const parts: string[] = [];
        while ((tm = tRe.exec(body))) parts.push(decodeXmlEntities(tm[1] ?? ""));
        value = parts.join("");
      } else {
        const v = (body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/) ?? [])[1] ?? "";
        if (t === "s") value = sharedStrings[Number(v)] ?? "";
        else if (t === "b") value = v === "1" ? "TRUE" : "FALSE";
        else value = decodeXmlEntities(v);
      }
      while (cells.length < idx) cells.push("");
      cells[idx] = value;
    }
    rows.push(cells);
  }
  return rows;
}

function parseXlsx(buf: Buffer): string[][] {
  const entries = readZipEntries(buf);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const ssEntry = byName.get("xl/sharedStrings.xml");
  const sharedStrings = ssEntry ? parseSharedStrings(readZipEntry(buf, ssEntry).toString("utf8")) : [];
  // Prefer sheet1, else first worksheet
  const sheetEntry = byName.get("xl/worksheets/sheet1.xml") ?? entries.find((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name));
  if (!sheetEntry) throw new Error("No worksheet found in XLSX file.");
  const xml = readZipEntry(buf, sheetEntry).toString("utf8");
  return parseSheetRows(xml, sharedStrings);
}

function normalizeRows(rawRows: string[][]): { headers: string[]; records: Record<string, string>[] } {
  const cleaned = rawRows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (cleaned.length === 0) return { headers: [], records: [] };
  const headers = (cleaned[0] ?? []).map((h) => String(h ?? "").trim());
  const records = cleaned.slice(1).map((row) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { rec[h || `Column ${i + 1}`] = String(row[i] ?? "").trim(); });
    return rec;
  });
  return { headers, records };
}

export function parseBoqImportFile(fileName: string, bytes: Buffer, projectId: string): ImportPreview {
  const lower = fileName.toLowerCase();
  let format: "xlsx" | "csv";
  let rawRows: string[][];
  if (lower.endsWith(".xlsx")) {
    format = "xlsx";
    rawRows = parseXlsx(bytes);
  } else if (lower.endsWith(".csv")) {
    format = "csv";
    rawRows = parseCsv(bytes.toString("utf8"));
  } else {
    throw new Error("Unsupported file type. Upload a .xlsx or .csv file.");
  }

  const { headers, records } = normalizeRows(rawRows);
  const mapped = mapHeaders(headers);
  const seenCodes = new Set<string>();
  const limited = records.slice(0, MAX_IMPORT_ROWS);

  const rows: ImportRow[] = limited.map((raw, index) => {
    const rowNumber = index + 2; // header is row 1
    const errors: string[] = [];
    const warnings: string[] = [];
    const candidate: { projectId: string; code: string; description: string; unit: string; estimatedQty: number; actualQty: number; unitRate: number } = { projectId, code: "", description: "", unit: "m", estimatedQty: 0, actualQty: 0, unitRate: 0 };
    let hasAny = false;

    headers.forEach((h, i) => {
      const key = mapped[i];
      const value = String(raw[h] ?? "").trim();
      if (value !== "") hasAny = true;
      if (!key) return;
      if (key === "code" || key === "description" || key === "unit") {
        candidate[key] = value;
      } else {
        const num = value === "" ? 0 : parseNumber(value);
        if (key === "estimatedQty") candidate.estimatedQty = num;
        else if (key === "actualQty") candidate.actualQty = num;
        else if (key === "unitRate") candidate.unitRate = num;
      }
    });

    if (!hasAny) {
      return { rowNumber, raw, data: null, errors: ["Empty row."], warnings, selected: false };
    }

    if (!mapped.includes("code")) errors.push("Missing Code column mapping.");
    if (!mapped.includes("description")) errors.push("Missing Description column mapping.");
    if (!mapped.includes("unit")) warnings.push("Unit missing; defaulting is not allowed. Map a Unit column.");
    if (!mapped.includes("estimatedQty")) warnings.push("Estimated qty column not mapped; defaulted to 0.");
    if (!mapped.includes("actualQty")) warnings.push("Actual qty column not mapped; defaulted to 0.");
    if (!mapped.includes("unitRate")) errors.push("Missing Unit Rate column mapping.");

    if (typeof candidate.unit === "string") candidate.unit = candidate.unit.toLowerCase();
    if (!(boqUnits as readonly string[]).includes(candidate.unit)) errors.push(`Invalid unit "${candidate.unit}". Allowed: ${boqUnits.join(", ")}.`);
    for (const n of ["estimatedQty", "actualQty", "unitRate"] as const) {
      if (!Number.isFinite(candidate[n])) errors.push(`${n} must be a valid number.`);
      else if (candidate[n] < 0) errors.push(`${n} cannot be negative.`);
    }
    if (String(candidate.code).trim().length < 2) errors.push("Code must be at least 2 characters.");
    if (String(candidate.description).trim().length < 3) errors.push("Description must be at least 3 characters.");

    const parsed = errors.length === 0 ? parseBoq(candidate as BoqInput) : null;
    if (!parsed && errors.length === 0) errors.push("Row failed BOQ validation.");

    const codeKey = String(candidate.code ?? "").trim().toLowerCase();
    if (codeKey && seenCodes.has(codeKey)) warnings.push("Duplicate code in file; review before accepting.");
    if (codeKey) seenCodes.add(codeKey);

    return { rowNumber, raw, data: parsed, errors, warnings, selected: errors.length === 0 };
  });

  if (records.length > MAX_IMPORT_ROWS) {
    rows.push({
      rowNumber: -1,
      raw: {},
      data: null,
      errors: [`File has ${records.length} data rows; only first ${MAX_IMPORT_ROWS} rows were processed.`],
      warnings: [],
      selected: false,
    });
  }

  const validRows = rows.filter((r) => r.data && r.errors.length === 0).length;
  return {
    fileName,
    format,
    headers,
    rows,
    totalRows: records.length,
    validRows,
    invalidRows: rows.filter((r) => r.rowNumber !== -1).length - validRows,
  };
}
