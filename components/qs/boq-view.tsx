"use client";

import { useMemo, useState } from "react";
import { Download, Upload, X, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { boqUnits, lineActual, lineEstimate, lineVariance } from "@/lib/boq";
import { useQuantitySurveyor } from "@/lib/data/admin-store";
import { cn, formatMoney } from "@/lib/utils";
import type { BoqItem } from "@/types";

const field = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

export function QsBoq() {
  const data = useQuantitySurveyor();
  const project = data.project;
  const [importOpen, setImportOpen] = useState(false);
  const csrfToken = data.viewer?.csrfToken ?? "";

  return (
    <div>
      <PageHeader
        title="Bill of quantities"
        description={project ? `${project.code} · ${project.name}. Estimated amount and measured amount are quantity × unit rate, rounded to the franc.` : "No project is assigned to this account."}
        actions={project ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportOpen((v) => !v)}><Upload />{importOpen ? "Close import" : "Import / Extract BOQ"}</Button>
            <Button asChild variant="outline"><a href={`/api/cpmis/business/boq/export?projectId=${encodeURIComponent(project.id)}`}><Download />Export BOQ summary</a></Button>
          </div>
        ) : undefined}
      />
      {project && importOpen ? <ImportBoqPanel projectId={project.id} csrfToken={csrfToken} onClose={() => setImportOpen(false)} /> : null}
      {project ? <AddLine projectId={project.id} onAdd={data.add} /> : null}
      <div className="mt-4 overflow-x-auto rounded-[22px] border border-black/5 bg-card">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs text-black/40">
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-2 py-3 font-medium">Estimated qty</th>
              <th className="px-2 py-3 font-medium">Actual qty</th>
              <th className="px-2 py-3 font-medium">Unit rate</th>
              <th className="px-2 py-3 font-medium">Estimated</th>
              <th className="px-2 py-3 font-medium">Actual</th>
              <th className="px-2 py-3 font-medium">Variance</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {data.lines.map((item) => (
              <LineRow key={`${item.id}-${item.estimatedQty}-${item.actualQty}-${item.unitRate}`} item={item} onSave={data.save} onRemove={data.remove} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-black/5 text-sm font-semibold">
              <td className="px-4 py-3" colSpan={4}>Bill total</td>
              <td className="px-2 py-3 tabular-nums">{formatMoney(data.estimated)}</td>
              <td className="px-2 py-3 tabular-nums">{formatMoney(data.expenditure)}</td>
              <td className="px-2 py-3 tabular-nums">{formatMoney(data.expenditure - data.estimated)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function AddLine({ projectId, onAdd }: { projectId: string; onAdd: (input: Omit<BoqItem, "id">) => { ok: true; saved?: Promise<boolean> } | { ok: false; error: string } }) {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState<string>(boqUnits[0]);
  const [estimatedQty, setEstimatedQty] = useState("0");
  const [actualQty, setActualQty] = useState("0");
  const [unitRate, setUnitRate] = useState("0");

  return (
    <form
      className="grid gap-3 rounded-[22px] border border-black/5 bg-card p-4 sm:grid-cols-2 lg:grid-cols-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = onAdd({
          projectId,
          code,
          description,
          unit,
          estimatedQty: Number(estimatedQty),
          actualQty: Number(actualQty),
          unitRate: Number(unitRate),
        });
        if (!result.ok) { toast.error(result.error); return; }
        if (result.saved && !(await result.saved)) return;
        toast.success("Line added. Project expenditure now includes it.");
        setCode("");
        setDescription("");
        setEstimatedQty("0");
        setActualQty("0");
        setUnitRate("0");
      }}
    >
      <Label>Code<Input className="mt-1" value={code} onChange={(event) => setCode(event.target.value)} required /></Label>
      <Label className="lg:col-span-2">Description<Input className="mt-1" value={description} onChange={(event) => setDescription(event.target.value)} required /></Label>
      <Label>
        Unit
        <select className={`mt-1 ${field}`} value={unit} onChange={(event) => setUnit(event.target.value)}>
          {boqUnits.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </Label>
      <Label>Estimated qty<Input className="mt-1" type="number" min={0} step="0.001" value={estimatedQty} onChange={(event) => setEstimatedQty(event.target.value)} required /></Label>
      <Label>Actual qty<Input className="mt-1" type="number" min={0} step="0.001" value={actualQty} onChange={(event) => setActualQty(event.target.value)} required /></Label>
      <Label className="lg:col-span-2">Unit rate (RWF)<Input className="mt-1" type="number" min={0} step="1" value={unitRate} onChange={(event) => setUnitRate(event.target.value)} required /></Label>
      <div className="flex items-end">
        <Button type="submit">Add line</Button>
      </div>
    </form>
  );
}

type ImportPreviewRow = {
  rowNumber: number;
  raw: Record<string, string>;
  data: { projectId: string; code: string; description: string; unit: string; estimatedQty: number; actualQty: number; unitRate: number } | null;
  errors: string[];
  warnings: string[];
  selected: boolean;
};

type ImportPreview = {
  fileName: string;
  format: "xlsx" | "csv" | "pdf" | "txt";
  headers: string[];
  rows: ImportPreviewRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warnings?: string[];
};

function ImportBoqPanel({ projectId, csrfToken, onClose }: { projectId: string; csrfToken: string; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [rows, setRows] = useState<ImportPreviewRow[]>([]);

  const selectedRows = useMemo(() => rows.filter((r) => r.selected && r.data && r.errors.length === 0), [rows]);
  const hasErrors = rows.some((r) => r.selected && r.errors.length > 0);

  async function uploadPreview() {
    if (!file) { toast.error("Choose a .xlsx, .csv, .pdf, or .txt file."); return; }
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("projectId", projectId);
      form.append("csrfToken", csrfToken);
      const res = await fetch("/api/cpmis/business/boq/import/preview", {
        method: "POST",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : undefined,
        body: form,
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.message || json?.error || "Could not parse the file.");
        return;
      }
      setPreview(json.preview as ImportPreview);
      setRows((json.preview as ImportPreview).rows ?? []);
      toast.success("File parsed. Review extracted rows before accepting.");
    } catch {
      toast.error("Could not upload the file.");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(index: number, patch: Partial<NonNullable<ImportPreviewRow["data"]>>) {
    setRows((current) => current.map((row, i) => {
      if (i !== index || !row.data) return row;
      const data = { ...row.data, ...patch };
      const errors: string[] = [];
      if (!data.code || data.code.trim().length < 2) errors.push("Code must be at least 2 characters.");
      if (!data.description || data.description.trim().length < 3) errors.push("Description must be at least 3 characters.");
      if (!(boqUnits as readonly string[]).includes(data.unit)) errors.push("Invalid unit.");
      if (!Number.isFinite(Number(data.estimatedQty)) || Number(data.estimatedQty) < 0) errors.push("Estimated qty must be >= 0.");
      if (!Number.isFinite(Number(data.actualQty)) || Number(data.actualQty) < 0) errors.push("Actual qty must be >= 0.");
      if (!Number.isFinite(Number(data.unitRate)) || Number(data.unitRate) < 0) errors.push("Unit rate must be >= 0.");
      return { ...row, data, errors, selected: errors.length === 0 ? row.selected : false };
    }));
  }

  async function acceptImport() {
    if (selectedRows.length === 0) { toast.error("Select at least one valid row to import."); return; }
    if (hasErrors) { toast.error("Fix or deselect invalid selected rows before accepting."); return; }
    setAccepting(true);
    try {
      const res = await fetch("/api/cpmis/business/boq/import/accept", {
        method: "POST",
        headers: { "content-type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) },
        credentials: "same-origin",
        body: JSON.stringify({
          projectId,
          rows: selectedRows.map((r) => r.data),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.error(json?.message || json?.error || "Could not import BOQ rows.");
        return;
      }
      toast.success(`Imported ${json.imported ?? selectedRows.length} BOQ row(s).`);
      window.location.reload();
    } catch {
      toast.error("Could not import BOQ rows.");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="mb-4 rounded-[22px] border border-black/5 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Import or extract BOQ</p>
          <p className="mt-1 text-sm text-black/45">Upload a .xlsx, .csv, .pdf, or .txt file. Extracted rows are validated for review before any BOQ lines are created.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" />Close</Button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Label className="min-w-[260px] flex-1">Import file
          <Input className="mt-1" type="file" accept=".xlsx,.csv,.pdf,.txt" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setRows([]); }} />
        </Label>
        <Button type="button" onClick={uploadPreview} disabled={loading || !file}>{loading ? "Parsing..." : "Upload and review"}</Button>
      </div>
      <p className="mt-2 text-xs text-black/40">Expected columns: Code, Description, Unit ({boqUnits.join(", ")}), Estimated qty, Actual qty, Unit rate. Header names are matched flexibly. PDF/TXT extraction is best-effort; review extracted rows carefully.</p>

      {preview ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{preview.validRows} valid</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-red-700"><AlertCircle className="h-3.5 w-3.5" />{preview.invalidRows} invalid</span>
            <span className="text-black/45">{preview.totalRows} data row(s) in {preview.fileName}</span>
          </div>
          {preview.warnings && preview.warnings.length > 0 ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {preview.warnings.map((w, i) => <p key={i}>{w}</p>)}
            </div>
          ) : null}

          <div className="mt-3 overflow-x-auto rounded-xl border border-black/5">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-black/[0.02] text-xs text-black/40">
                <tr>
                  <th className="px-3 py-2">Accept</th>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Est. qty</th>
                  <th className="px-3 py-2">Actual qty</th>
                  <th className="px-3 py-2">Unit rate</th>
                  <th className="px-3 py-2">Validation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => row.rowNumber === -1 ? (
                  <tr key={`meta-${i}`} className="border-t border-black/5 bg-amber-50/50">
                    <td className="px-3 py-2" colSpan={9}><p className="text-amber-700">{row.errors.join(" ")}</p></td>
                  </tr>
                ) : (
                  <tr key={`${row.rowNumber}-${i}`} className={cn("border-t border-black/5 align-top", row.errors.length > 0 ? "bg-red-50/20" : "")}>
                    <td className="px-3 py-2"><input type="checkbox" checked={row.selected} disabled={!row.data || row.errors.length > 0} onChange={(e) => setRows((cur) => cur.map((r, idx) => idx === i ? { ...r, selected: e.target.checked } : r))} /></td>
                    <td className="px-3 py-2 text-xs text-black/45">{row.rowNumber}</td>
                    <td className="px-3 py-2"><input className="h-8 w-24 rounded border border-input px-2 text-sm" value={row.data?.code ?? ""} onChange={(e) => updateRow(i, { code: e.target.value })} /></td>
                    <td className="px-3 py-2"><input className="h-8 w-full min-w-[180px] rounded border border-input px-2 text-sm" value={row.data?.description ?? ""} onChange={(e) => updateRow(i, { description: e.target.value })} /></td>
                    <td className="px-3 py-2"><select className="h-8 rounded border border-input px-2 text-sm" value={row.data?.unit ?? "m"} onChange={(e) => updateRow(i, { unit: e.target.value })}>{boqUnits.map((u) => <option key={u} value={u}>{u}</option>)}</select></td>
                    <td className="px-3 py-2"><input className="h-8 w-24 rounded border border-input px-2 text-sm" type="number" min={0} step="0.001" value={row.data?.estimatedQty ?? 0} onChange={(e) => updateRow(i, { estimatedQty: Number(e.target.value) })} /></td>
                    <td className="px-3 py-2"><input className="h-8 w-24 rounded border border-input px-2 text-sm" type="number" min={0} step="0.001" value={row.data?.actualQty ?? 0} onChange={(e) => updateRow(i, { actualQty: Number(e.target.value) })} /></td>
                    <td className="px-3 py-2"><input className="h-8 w-28 rounded border border-input px-2 text-sm" type="number" min={0} step="1" value={row.data?.unitRate ?? 0} onChange={(e) => updateRow(i, { unitRate: Number(e.target.value) })} /></td>
                    <td className="px-3 py-2 text-xs">
                      {row.errors.length > 0 ? <p className="text-red-600">{row.errors.join(" ")}</p> : <p className="text-emerald-600">Valid</p>}
                      {row.warnings.length > 0 ? <p className="mt-1 text-amber-600">{row.warnings.join(" ")}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={acceptImport} disabled={accepting || selectedRows.length === 0}>{accepting ? "Importing..." : `Accept ${selectedRows.length} selected row(s)`}</Button>
            <Button type="button" variant="outline" onClick={() => { setPreview(null); setRows([]); setFile(null); }}>Clear preview</Button>
            <p className="text-xs text-black/40">Only selected valid rows are imported. Server revalidates all rows before creating BOQ lines.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LineRow({
  item,
  onSave,
  onRemove,
}: {
  item: BoqItem;
  onSave: (id: string, input: Omit<BoqItem, "id">) => { ok: true; saved?: Promise<boolean> } | { ok: false; error: string };
  onRemove: (id: string) => { ok: true; saved?: Promise<boolean> } | { ok: false; error: string };
}) {
  const [estimatedQty, setEstimatedQty] = useState(String(item.estimatedQty));
  const [actualQty, setActualQty] = useState(String(item.actualQty));
  const [unitRate, setUnitRate] = useState(String(item.unitRate));
  const draft = {
    ...item,
    estimatedQty: Number(estimatedQty),
    actualQty: Number(actualQty),
    unitRate: Number(unitRate),
  };
  const gap = lineVariance(draft);

  return (
    <tr className="border-t border-black/5 align-top">
      <td className="px-4 py-3">
        <p className="font-medium">{item.code}</p>
        <p className="text-xs text-black/45">{item.description}</p>
        <p className="text-xs text-black/45">{item.unit}</p>
      </td>
      <td className="px-2 py-3"><Input type="number" min={0} step="0.001" value={estimatedQty} onChange={(event) => setEstimatedQty(event.target.value)} /></td>
      <td className="px-2 py-3"><Input type="number" min={0} step="0.001" value={actualQty} onChange={(event) => setActualQty(event.target.value)} /></td>
      <td className="px-2 py-3"><Input type="number" min={0} step="1" value={unitRate} onChange={(event) => setUnitRate(event.target.value)} /></td>
      <td className="px-2 py-3 tabular-nums">{formatMoney(lineEstimate(draft))}</td>
      <td className="px-2 py-3 tabular-nums">{formatMoney(lineActual(draft))}</td>
      <td className={cn("px-2 py-3 tabular-nums", gap > 0 && "text-accent")}>{formatMoney(gap)}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="navy"
            onClick={async () => {
              const result = onSave(item.id, draft);
              if (!result.ok) { toast.error(result.error); return; }
              if (result.saved && !(await result.saved)) return;
              toast.success("Saved. Project expenditure was recalculated.");
            }}
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              const result = onRemove(item.id);
              if (!result.ok) { toast.error(result.error); return; }
              if (result.saved && !(await result.saved)) return;
              toast.success("Line removed. Project expenditure was recalculated.");
            }}
          >
            Remove
          </Button>
        </div>
      </td>
    </tr>
  );
}
