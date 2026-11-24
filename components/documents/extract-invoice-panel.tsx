"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Copy, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

type InvoiceFields = {
  invoiceNumber: string;
  vendorName: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  poNumber: string;
  projectReference: string;
  notes: string;
};

type InvoiceValidation = {
  errors: string[];
  warnings: string[];
  fieldErrors: Partial<Record<keyof InvoiceFields, string>>;
};

type InvoiceExtraction = {
  fileName: string;
  fileType: string;
  textExtracted: boolean;
  confidence: "low" | "medium" | "high";
  warnings: string[];
  fields: Record<string, unknown>;
  validation?: InvoiceValidation;
  rawTextPreview: string;
};

function toEditableFields(fields: Record<string, unknown> | undefined): InvoiceFields {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    invoiceNumber: str(fields?.invoiceNumber),
    vendorName: str(fields?.vendorName),
    invoiceDate: str(fields?.invoiceDate),
    dueDate: str(fields?.dueDate),
    currency: str(fields?.currency),
    subtotal: str(fields?.subtotal),
    tax: str(fields?.tax),
    total: str(fields?.total),
    poNumber: str(fields?.poNumber),
    projectReference: str(fields?.projectReference),
    notes: str(fields?.notes),
  };
}

const KNOWN_CURRENCIES = new Set(["RWF", "USD", "EUR", "GBP", "KES", "UGX", "TZS", "FRW", "ZAR", "NGN", "CAD", "AUD"]);

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === value;
}

function validateInvoiceFields(fields: InvoiceFields): InvoiceValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldErrors: Partial<Record<keyof InvoiceFields, string>> = {};
  const addError = (field: keyof InvoiceFields, message: string) => { fieldErrors[field] = message; errors.push(message); };

  if (fields.invoiceNumber.trim().length > 64) addError("invoiceNumber", "Invoice number is too long.");
  if (fields.vendorName.trim().length > 120) addError("vendorName", "Vendor name is too long.");

  for (const key of ["invoiceDate", "dueDate"] as const) {
    const value = fields[key].trim();
    if (!value) continue;
    if (!isValidIsoDate(value)) addError(key, `${key === "invoiceDate" ? "Invoice date" : "Due date"} must be a valid YYYY-MM-DD date.`);
    else {
      const year = Number(value.slice(0, 4));
      if (year < 2000 || year > 2100) addError(key, `${key === "invoiceDate" ? "Invoice date" : "Due date"} is outside the supported year range.`);
    }
  }
  if (fields.invoiceDate.trim() && fields.dueDate.trim() && isValidIsoDate(fields.invoiceDate.trim()) && isValidIsoDate(fields.dueDate.trim()) && fields.dueDate.trim() < fields.invoiceDate.trim()) {
    addError("dueDate", "Due date cannot be before invoice date.");
  }

  const currency = fields.currency.trim().toUpperCase();
  if (currency) {
    if (!/^[A-Z]{3}$/.test(currency)) addError("currency", "Currency must be a 3-letter code.");
    else if (!KNOWN_CURRENCIES.has(currency)) warnings.push(`Currency "${currency}" is not in the common currency list; verify it.`);
  }

  const amount = (key: "subtotal" | "tax" | "total") => {
    const raw = fields[key].trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) { addError(key, `${key[0]!.toUpperCase() + key.slice(1)} must be a valid number.`); return null; }
    if (n < 0) { addError(key, `${key[0]!.toUpperCase() + key.slice(1)} cannot be negative.`); return null; }
    if (Math.abs(n) > 1_000_000_000_000) { addError(key, `${key[0]!.toUpperCase() + key.slice(1)} is unreasonably large.`); return null; }
    return n;
  };
  const subtotal = amount("subtotal");
  const tax = amount("tax");
  const total = amount("total");

  if (subtotal !== null && tax !== null && total !== null) {
    const expected = subtotal + tax;
    const diff = Math.abs(expected - total);
    const tolerance = Math.max(1, Math.abs(total) * 0.01);
    if (diff > tolerance) warnings.push(`Total (${total}) does not match subtotal + tax (${expected}); verify amounts.`);
  }
  if (total !== null && subtotal !== null && total < subtotal) warnings.push("Total is less than subtotal; verify tax/discount handling.");

  if (!fields.invoiceNumber.trim()) warnings.push("Invoice number is missing.");
  if (!fields.vendorName.trim()) warnings.push("Vendor name is missing.");
  if (!fields.invoiceDate.trim()) warnings.push("Invoice date is missing.");
  if (!fields.total.trim()) warnings.push("Total amount is missing.");

  return { errors, warnings, fieldErrors };
}

export function ExtractInvoicePanel({ csrfToken }: { csrfToken: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<InvoiceExtraction | null>(null);
  const [fields, setFields] = useState<InvoiceFields>(toEditableFields(undefined));
  const [accepted, setAccepted] = useState(false);

  async function onExtract(event: FormEvent) {
    event.preventDefault();
    if (!file) { setError("Choose a file to extract."); return; }
    setLoading(true);
    setError(null);
    setAccepted(false);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("csrfToken", csrfToken);
      const res = await fetch("/api/documents/extract-invoice", {
        method: "POST",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : undefined,
        body: form,
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const message = json?.message || json?.error || "Could not extract invoice metadata.";
        setError(message);
        toast.error(message);
        return;
      }
      const ex = json.extraction as InvoiceExtraction;
      setExtraction(ex);
      setFields(toEditableFields(ex.fields));
      toast.success("Invoice metadata extracted. Review before accepting.");
    } catch {
      const message = "Could not extract invoice metadata.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  function updateField<K extends keyof InvoiceFields>(key: K, value: InvoiceFields[K]) {
    setAccepted(false);
    setFields((current) => ({ ...current, [key]: value }));
  }

  const validation = extraction ? validateInvoiceFields(fields) : null;

  function acceptedPayload() {
    return {
      acceptedAt: new Date().toISOString(),
      sourceFile: extraction ? { fileName: extraction.fileName, fileType: extraction.fileType } : null,
      confidence: extraction?.confidence ?? "low",
      extractionWarnings: extraction?.warnings ?? [],
      validation,
      fields: {
        ...fields,
        subtotal: fields.subtotal === "" ? null : Number(fields.subtotal),
        tax: fields.tax === "" ? null : Number(fields.tax),
        total: fields.total === "" ? null : Number(fields.total),
      },
    };
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(acceptedPayload(), null, 2));
      toast.success("Invoice metadata JSON copied.");
    } catch {
      toast.error("Could not copy JSON.");
    }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(acceptedPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${(extraction?.fileName || "invoice-metadata").replace(/\.[^.]+$/, "")}-metadata.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function acceptMetadata() {
    if (validation && validation.errors.length > 0) {
      toast.error("Fix validation errors before accepting.");
      return;
    }
    setAccepted(true);
    toast.success("Invoice metadata accepted for this review. Copy or download the JSON if you need to store it.");
  }

  return (
    <div className="grid gap-4">
      <form className="flex flex-wrap items-end gap-3" onSubmit={onExtract}>
        <label className="grid min-w-[260px] flex-1 gap-1">
          <Label>Invoice file</Label>
          <Input
            type="file"
            accept=".pdf,.txt,.csv,.png,.jpg,.jpeg,.webp,.tif,.tiff,.docx,.xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
              setAccepted(false);
            }}
          />
        </label>
        <Button type="submit" disabled={loading || !file}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Extracting...</> : "Extract metadata"}
        </Button>
        {extraction ? (
          <Button type="button" variant="outline" onClick={() => { setFile(null); setExtraction(null); setFields(toEditableFields(undefined)); setError(null); setAccepted(false); }}>
            Clear
          </Button>
        ) : null}
      </form>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {extraction ? (
        <div className="grid gap-4 rounded-xl border border-black/5 bg-light-gray/30 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${extraction.confidence === "high" ? "bg-emerald-50 text-emerald-700" : extraction.confidence === "medium" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
              {extraction.confidence === "high" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {extraction.confidence} confidence
            </span>
            <span className="text-black/45">{extraction.fileName}</span>
            <span className="text-black/35">{extraction.textExtracted ? "Text extracted" : "No readable text extracted"}</span>
          </div>

          {extraction.warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="font-medium">Extraction warnings</p>
              <ul className="mt-1 list-disc pl-5">
                {extraction.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          ) : null}

          {validation && validation.errors.length > 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <p className="font-medium">Validation errors</p>
              <ul className="mt-1 list-disc pl-5">
                {validation.errors.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          ) : null}

          {validation && validation.warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="font-medium">Validation warnings</p>
              <ul className="mt-1 list-disc pl-5">
                {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1"><Label>Invoice number</Label><Input value={fields.invoiceNumber} onChange={(e) => updateField("invoiceNumber", e.target.value)} />{validation?.fieldErrors.invoiceNumber ? <p className="text-xs text-destructive">{validation.fieldErrors.invoiceNumber}</p> : null}</label>
            <label className="grid gap-1"><Label>Vendor / supplier</Label><Input value={fields.vendorName} onChange={(e) => updateField("vendorName", e.target.value)} />{validation?.fieldErrors.vendorName ? <p className="text-xs text-destructive">{validation.fieldErrors.vendorName}</p> : null}</label>
            <label className="grid gap-1"><Label>Invoice date</Label><Input type="date" value={fields.invoiceDate} onChange={(e) => updateField("invoiceDate", e.target.value)} />{validation?.fieldErrors.invoiceDate ? <p className="text-xs text-destructive">{validation.fieldErrors.invoiceDate}</p> : null}</label>
            <label className="grid gap-1"><Label>Due date</Label><Input type="date" value={fields.dueDate} onChange={(e) => updateField("dueDate", e.target.value)} />{validation?.fieldErrors.dueDate ? <p className="text-xs text-destructive">{validation.fieldErrors.dueDate}</p> : null}</label>
            <label className="grid gap-1"><Label>Currency</Label><Input value={fields.currency} onChange={(e) => updateField("currency", e.target.value)} placeholder="RWF, USD..." />{validation?.fieldErrors.currency ? <p className="text-xs text-destructive">{validation.fieldErrors.currency}</p> : null}</label>
            <label className="grid gap-1"><Label>PO number</Label><Input value={fields.poNumber} onChange={(e) => updateField("poNumber", e.target.value)} />{validation?.fieldErrors.poNumber ? <p className="text-xs text-destructive">{validation.fieldErrors.poNumber}</p> : null}</label>
            <label className="grid gap-1"><Label>Subtotal</Label><Input type="number" step="0.01" value={fields.subtotal} onChange={(e) => updateField("subtotal", e.target.value)} />{validation?.fieldErrors.subtotal ? <p className="text-xs text-destructive">{validation.fieldErrors.subtotal}</p> : null}</label>
            <label className="grid gap-1"><Label>Tax / VAT</Label><Input type="number" step="0.01" value={fields.tax} onChange={(e) => updateField("tax", e.target.value)} />{validation?.fieldErrors.tax ? <p className="text-xs text-destructive">{validation.fieldErrors.tax}</p> : null}</label>
            <label className="grid gap-1"><Label>Total</Label><Input type="number" step="0.01" value={fields.total} onChange={(e) => updateField("total", e.target.value)} />{validation?.fieldErrors.total ? <p className="text-xs text-destructive">{validation.fieldErrors.total}</p> : null}</label>
            <label className="grid gap-1"><Label>Project reference</Label><Input value={fields.projectReference} onChange={(e) => updateField("projectReference", e.target.value)} />{validation?.fieldErrors.projectReference ? <p className="text-xs text-destructive">{validation.fieldErrors.projectReference}</p> : null}</label>
          </div>
          <label className="grid gap-1"><Label>Notes</Label><Textarea value={fields.notes} onChange={(e) => updateField("notes", e.target.value)} placeholder="Review notes or corrections..." /></label>

          <details className="rounded-lg border border-black/5 bg-white px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-black/70">Raw text preview</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-black/60">{extraction.rawTextPreview || "No text extracted."}</pre>
          </details>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={acceptMetadata} disabled={!!validation && validation.errors.length > 0}>Accept metadata</Button>
            <Button type="button" variant="outline" onClick={copyJson}><Copy className="h-4 w-4" />Copy JSON</Button>
            <Button type="button" variant="outline" onClick={downloadJson}><Download className="h-4 w-4" />Download JSON</Button>
            {accepted ? <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Accepted for review</span> : null}
          </div>
          <p className="text-xs text-black/45">Accept confirms you reviewed the extracted fields. This does not persist invoice metadata to document records unless a dedicated metadata field is added; use Copy/Download JSON to preserve the reviewed result.</p>
        </div>
      ) : null}
    </div>
  );
}
