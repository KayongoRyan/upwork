import { inflateRawSync } from "node:zlib";

export interface InvoiceMetadata {
  invoiceNumber: string | null;
  vendorName: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  poNumber: string | null;
  projectReference: string | null;
  notes: string | null;
}

export interface InvoiceExtractionResult {
  fileName: string;
  fileType: string;
  textExtracted: boolean;
  confidence: "low" | "medium" | "high";
  warnings: string[];
  fields: InvoiceMetadata;
  rawTextPreview: string;
}

function decodePdfTextString(input: string): string {
  // Handles basic PDF literal string escapes
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch !== "\\") { out += ch; continue; }
    const next = input[i + 1];
    if (next === undefined) break;
    if (next === "n") { out += "\n"; i++; }
    else if (next === "r") { out += "\n"; i++; }
    else if (next === "t") { out += "\t"; i++; }
    else if (next === "b" || next === "f") { i++; }
    else if (next === "(" || next === ")" || next === "\\") { out += next; i++; }
    else if (/[0-7]/.test(next)) {
      let oct = next;
      let j = i + 2;
      for (; j < i + 4 && j < input.length && /[0-7]/.test(input[j]!); j++) oct += input[j]!;
      out += String.fromCharCode(parseInt(oct, 8));
      i = j - 1;
    } else { out += next; i++; }
  }
  return out;
}

export function extractPdfText(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  const chunks: string[] = [];

  // Decompress FlateDecode streams when possible and scan for text ops.
  const streamRe = /<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  const candidates: string[] = [raw];
  while ((m = streamRe.exec(raw))) {
    const dict = m[1] ?? "";
    const data = Buffer.from(m[2] ?? "", "latin1");
    if (/\/FlateDecode/.test(dict)) {
      try { candidates.push(inflateRawSync(data).toString("latin1")); } catch { /* ignore */ }
    } else {
      candidates.push(data.toString("latin1"));
    }
  }

  for (const text of candidates) {
    const btRe = /BT([\s\S]*?)ET/g;
    let bt: RegExpExecArray | null;
    while ((bt = btRe.exec(text))) {
      const block = bt[1] ?? "";
      // Tj: (string) Tj
      const tjRe = /\(([^()]*(?:\\.[^()]*)*)\)\s*Tj/g;
      let tj: RegExpExecArray | null;
      while ((tj = tjRe.exec(block))) chunks.push(decodePdfTextString(tj[1] ?? ""));
      // TJ: [(...) ...] TJ
      const tjArrRe = /\[([\s\S]*?)\]\s*TJ/g;
      let ta: RegExpExecArray | null;
      while ((ta = tjArrRe.exec(block))) {
        const arr = ta[1] ?? "";
        const strRe = /\(([^()]*(?:\\.[^()]*)*)\)/g;
        let s: RegExpExecArray | null;
        let part = "";
        while ((s = strRe.exec(arr))) part += decodePdfTextString(s[1] ?? "");
        if (part) chunks.push(part);
      }
      if (chunks.length > 0) chunks.push("\n");
    }
  }

  const joined = chunks.join(" ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return joined;
}

function extractPlainText(bytes: Buffer): string {
  return bytes.toString("utf8").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function pickDate(text: string, labels: RegExp[]): string | null {
  for (const label of labels) {
    const m = text.match(new RegExp(`${label.source}[^\\n\\r:]{0,30}[:\\s]*([0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}|[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}|[A-Za-z]{3,9}\\s+[0-9]{1,2},?\\s+[0-9]{4})`, "i"));
    if (m?.[1]) return normalizeDate(m[1]);
  }
  // fallback: first ISO-like date
  const iso = text.match(/\b(20\d{2}[-/.][0-9]{1,2}[-/.][0-9]{1,2})\b/);
  return iso?.[1] ? normalizeDate(iso[1]) : null;
}

function normalizeDate(value: string): string | null {
  const v = value.trim().replace(/\./g, "-").replace(/\//g, "-");
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  const dmy = v.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dmy) {
    const year = dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]!;
    return `${year}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  }
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    const d = new Date(parsed);
    if (d.getFullYear() > 2000 && d.getFullYear() < 2100) return d.toISOString().slice(0, 10);
  }
  return null;
}

function pickAmount(text: string, labels: RegExp[]): number | null {
  for (const label of labels) {
    const re = new RegExp(`${label.source}[^\\n\\r0-9-]{0,40}([A-Z]{3})?\\s*([\\(\\-]?\\s*[0-9][0-9,.' ]{0,20}[0-9](?:\\.[0-9]{1,2})?\\s*\\)?)`, "i");
    const m = text.match(re);
    if (m?.[2]) {
      const n = parseAmount(m[2]);
      if (n !== null) return n;
    }
  }
  return null;
}

function parseAmount(raw: string): number | null {
  let s = raw.trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[,\s]/g, "").replace(/'/g, "");
  if (s.startsWith("-")) { negative = true; s = s.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function pickString(text: string, labels: RegExp[], maxLen = 80): string | null {
  for (const label of labels) {
    const m = text.match(new RegExp(`${label.source}[^\\n\\r:]{0,20}[:\\s]+([^\\n\\r]{2,${maxLen}})`, "i"));
    if (m?.[1]) {
      const val = m[1].trim().replace(/\s{2,}.*/, "").trim();
      if (val) return val;
    }
  }
  return null;
}

function detectCurrency(text: string): string | null {
  const m = text.match(/\b(RWF|USD|EUR|GBP|KES|UGX|TZS)\b/i);
  if (m?.[1]) return m[1].toUpperCase();
  if (/\bFRW\b/i.test(text)) return "RWF";
  if (/[$]/.test(text)) return "USD";
  return null;
}

function detectVendor(text: string): string | null {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 8)) {
    if (/invoice|tax\s*invoice|receipt|bill\s*to|statement|date|total|due/i.test(line)) continue;
    if (line.length >= 3 && line.length <= 80) return line;
  }
  return null;
}

export function extractInvoiceMetadata(fileName: string, fileType: string, bytes: Buffer): InvoiceExtractionResult {
  const lower = fileName.toLowerCase();
  const warnings: string[] = [];
  let text = "";
  let textExtracted = false;

  try {
    if (lower.endsWith(".pdf") || fileType === "application/pdf") {
      text = extractPdfText(bytes);
      textExtracted = text.length > 20;
      if (!textExtracted) warnings.push("No readable text found in PDF. If this is a scanned invoice, OCR is required for automatic extraction.");
    } else if (lower.endsWith(".txt") || lower.endsWith(".csv") || fileType.startsWith("text/")) {
      text = extractPlainText(bytes);
      textExtracted = text.length > 0;
    } else if (lower.endsWith(".docx") || lower.endsWith(".xlsx") || lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp") || lower.endsWith(".tif") || lower.endsWith(".tiff")) {
      warnings.push("Automatic text extraction is not available for this file type in the current environment. Enter or review metadata manually.");
    } else {
      warnings.push("Unsupported file type for automatic extraction. Enter or review metadata manually.");
    }
  } catch {
    warnings.push("Could not extract text from file. Enter or review metadata manually.");
  }

  const invoiceNumber = pickString(text, [/\b(invoice\s*(?:no|number|#|id))/, /\binv\s*(?:no|#)/, /\binvoice\b/]) ?? pickString(text, [/\b(reference\s*(?:no|number|#))/, /\bref\s*(?:no|#)\b/]);
  const vendorName = pickString(text, [/\b(vendor|supplier|from|seller|company)\b/]) ?? detectVendor(text);
  const invoiceDate = pickDate(text, [/\b(invoice\s*date)/, /\b(date\s*of\s*issue)/, /\b(issue\s*date)/, /\b(date)\b/]);
  const dueDate = pickDate(text, [/\b(due\s*date)/, /\b(payment\s*due)/, /\bdue\b/]);
  const currency = detectCurrency(text);
  const subtotal = pickAmount(text, [/\b(subtotal|sub\s*total|net\s*amount)\b/]);
  const tax = pickAmount(text, [/\b(tax|vat|gst|sales\s*tax)\b/]);
  const total = pickAmount(text, [/\b(total\s*(?:amount|due|payable)?)/, /\b(amount\s*due)/, /\b(grand\s*total)/, /\bbalance\s*due\b/]);
  const poNumber = pickString(text, [/\b(po\s*(?:no|number|#))/, /\bpurchase\s*order\b/]);
  const projectReference = pickString(text, [/\b(project\s*(?:name|ref|reference|code|no|number)?)\b/, /\bjob\s*(?:no|number|ref)\b/]);

  const fields: InvoiceMetadata = {
    invoiceNumber, vendorName, invoiceDate, dueDate, currency, subtotal, tax, total, poNumber, projectReference,
    notes: null,
  };

  const present = Object.values(fields).filter((v) => v !== null && v !== "").length;
  let confidence: "low" | "medium" | "high" = "low";
  if (textExtracted && present >= 5) confidence = "high";
  else if (textExtracted && present >= 3) confidence = "medium";
  if (!textExtracted) confidence = "low";

  if (textExtracted && !total) warnings.push("Total amount was not confidently detected; review before accepting.");
  if (textExtracted && !invoiceNumber) warnings.push("Invoice number was not confidently detected; review before accepting.");
  if (textExtracted && !invoiceDate) warnings.push("Invoice date was not confidently detected; review before accepting.");

  return {
    fileName,
    fileType,
    textExtracted,
    confidence,
    warnings,
    fields,
    rawTextPreview: text.slice(0, 4000),
  };
}
