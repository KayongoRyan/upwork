"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Copy, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useAdmin } from "@/lib/data/admin-store";
import {
  documentCategoryLabel,
  issueWarning,
  issuedRevision,
  latestRevision,
  standing,
  standingLabel,
} from "@/lib/documents";
import { roleLabel, userRoles } from "@/lib/labels";
import { formatDateTime, fullName } from "@/lib/utils";
import type { DocumentCategory, DocumentRevision, ProjectDocument, UserRole } from "@/types";

const selectClass = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";
const categories = Object.keys(documentCategoryLabel) as DocumentCategory[];

export function DocumentsView() {
  const data = useAdmin();
  const documents = data.documents ?? [];
  const params = useSearchParams();
  const requested = params.get("project");
  const requestedDoc = params.get("doc");
  const register = params.get("register") === "1";
  const revise = params.get("revise");
  const extract = params.get("extract") === "1";
  const [seen, setSeen] = useState(requested);
  const [seenDoc, setSeenDoc] = useState(requestedDoc);
  const [projectId, setProjectId] = useState(requested && data.projects.some((item) => item.id === requested) ? requested : "all");
  const [category, setCategory] = useState<DocumentCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(requestedDoc);
  if (requested !== seen) {
    setSeen(requested);
    if (requested && data.projects.some((item) => item.id === requested)) setProjectId(requested);
  }
  if (requestedDoc !== seenDoc) {
    setSeenDoc(requestedDoc);
    setOpenId(requestedDoc);
  }

  useEffect(() => {
    if (!openId) return;
    document.getElementById(`doc-${openId}`)?.scrollIntoView({ block: "center" });
  }, [openId]);

  const needle = query.trim().toLowerCase();
  const rows = documents.filter((item) => {
    if (projectId !== "all" && item.projectId !== projectId) return false;
    if (category !== "all" && item.category !== category) return false;
    if (!needle) return true;
    const project = data.projects.find((entry) => entry.id === item.projectId);
    return `${item.number} ${item.title} ${item.discipline} ${project?.name ?? ""} ${project?.code ?? ""}`.toLowerCase().includes(needle);
  });
  const warnings = rows.map(issueWarning).filter((item): item is string => Boolean(item));
  const issued = rows.filter((item) => latestRevision(item)?.status === "approved").length;
  const pending = rows.filter((item) => latestRevision(item)?.status === "in_review").length;
  const superseded = rows.reduce((sum, item) => sum + Math.max(0, item.revisions.length - 1), 0);

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Controlled register. A new file is a revision. Site work uses the issued revision only. An in-review drawing is not permission to build."
        actions={
          <>
            <Button asChild variant="outline"><a href="/admin/documents?extract=1">Extract invoice metadata</a></Button>
            <Button asChild variant="outline"><a href="/admin/documents?revise=1">Upload revision</a></Button>
            <Button asChild><a href="/admin/documents?register=1">Register document</a></Button>
          </>
        }
      />
      {register ? (
        <section className="mb-4 rounded-[22px] border border-black/5 bg-card p-4">
          <h2 className="text-base font-semibold">Register document</h2>
          <p className="mt-1 mb-4 text-sm text-black/55">The first file is Rev 01. Leave it in review unless it is ready to build from.</p>
          <RegisterForm
            projects={data.projects}
            users={data.users}
            csrfToken={data.viewer?.csrfToken ?? ""}
            serverError={params.get("error")}
          />
        </section>
      ) : null}
      {extract && !register && !revise ? (
        <section className="mb-4 rounded-[22px] border border-black/5 bg-card p-4">
          <h2 className="text-base font-semibold">Extract invoice metadata</h2>
          <p className="mt-1 mb-4 text-sm text-black/55">Upload an invoice or receipt, review the extracted fields, edit where needed, then explicitly accept. Extraction is best-effort; scanned/image files may require manual entry.</p>
          <ExtractInvoicePanel csrfToken={data.viewer?.csrfToken ?? ""} />
        </section>
      ) : null}
      {revise && !register ? (
        <section className="mb-4 rounded-[22px] border border-black/5 bg-card p-4">
          <h2 className="text-base font-semibold">Upload revision</h2>
          <p className="mt-1 mb-4 text-sm text-black/55">The new file stays in review. The issued revision does not change until you issue this one.</p>
          {documents.length === 0 ? <p className="text-sm text-black/55">Register a document before uploading a revision.</p> : (
            <ReviseForm
              key={revise}
              documents={documents}
              initialId={documents.some((item) => item.id === revise) ? revise : documents[0].id}
              csrfToken={data.viewer?.csrfToken ?? ""}
              serverError={params.get("error")}
            />
          )}
        </section>
      ) : null}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Documents" value={String(rows.length)} />
        <Stat label="Issued" value={String(issued)} />
        <Stat label="In review" value={String(pending)} />
        <Stat label="Superseded revisions" value={String(superseded)} />
      </div>
      {warnings.length > 0 ? (
        <section className="mb-4 rounded-[22px] border border-black/5 bg-card p-4">
          <h2 className="text-sm font-semibold">Do not build from these</h2>
          <ul className="mt-2 space-y-2">
            {warnings.map((warning) => (
              <li key={warning} className="rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search number, title, project" className="lg:max-w-sm" />
        <select aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className={`${selectClass} lg:max-w-xs`}>
          <option value="all">All projects</option>
          {data.projects.map((project) => (
            <option key={project.id} value={project.id}>{project.code}</option>
          ))}
        </select>
        <select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory | "all")} className={`${selectClass} lg:max-w-xs`}>
          <option value="all">All categories</option>
          {categories.map((item) => (
            <option key={item} value={item}>{documentCategoryLabel[item]}</option>
          ))}
        </select>
      </div>
      <div className="overflow-hidden rounded-[22px] border border-black/5 bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="text-left text-[11px] text-muted-foreground">
              <tr>
                {["Number", "Document", "Project", "Category", "Latest", "Issued", "Owner", "Updated"].map((label) => (
                  <th key={label} className="px-3 py-3 font-medium tracking-wide uppercase">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const latest = latestRevision(item);
                const issuedRev = issuedRevision(item);
                const owner = data.users.find((user) => user.id === item.ownerId);
                const project = data.projects.find((entry) => entry.id === item.projectId);
                return (
                  <DocumentBlock
                    key={item.id}
                    item={item}
                    open={openId === item.id}
                    project={project ? `${project.code}` : "—"}
                    owner={owner ? fullName(owner) : "Unassigned"}
                    latest={latest}
                    issued={issuedRev}
                    users={data.users}
                    onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                    onReviseHref={`/admin/documents?revise=${item.id}`}
                    onIssue={async () => {
                      const result = data.issueRevision(item.id);
                      if (!result.ok) { toast.error(result.error); return; }
                      if (result.saved && !(await result.saved)) return;
                      toast.success(`${item.number} issued. Earlier revisions are superseded.`);
                    }}
                    onAccess={async (access) => {
                      const result = data.setDocumentAccess(item.id, access);
                      if (!result.ok) { toast.error(result.error); return; }
                      if (result.saved && !(await result.saved)) return;
                      toast.success("Access updated.");
                    }}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? <p className="px-4 py-8 text-sm text-muted-foreground">No documents match.</p> : null}
      </div>

    </div>
  );
}

function DocumentBlock({
  item,
  open,
  project,
  owner,
  latest,
  issued,
  users,
  onToggle,
  onReviseHref,
  onIssue,
  onAccess,
}: {
  item: ProjectDocument;
  open: boolean;
  project: string;
  owner: string;
  latest: DocumentRevision | null;
  issued: DocumentRevision | null;
  users: { id: string; firstName: string; lastName: string }[];
  onToggle: () => void;
  onReviseHref: string;
  onIssue: () => void;
  onAccess: (access: UserRole[]) => void;
}) {
  const state = latest ? standing(item, latest) : "draft";
  return (
    <>
      <tr id={`doc-${item.id}`} className="border-t border-black/5">
        <td className="px-3 py-3 font-mono text-xs">
          <button type="button" className="hover:underline" onClick={onToggle}>{item.number}</button>
        </td>
        <td className="px-3 py-3">
          <button type="button" className="text-left font-medium hover:underline" onClick={onToggle}>{item.title}</button>
          <p className="text-xs text-black/45">{item.discipline}</p>
        </td>
        <td className="px-3 py-3">{project}</td>
        <td className="px-3 py-3">{documentCategoryLabel[item.category]}</td>
        <td className="px-3 py-3">
          {latest ? <span className="inline-flex items-center gap-2">Rev {latest.revision} <StandingBadge value={state} /></span> : "—"}
        </td>
        <td className="px-3 py-3">{issued ? `Rev ${issued.revision}` : <span className="text-accent">None</span>}</td>
        <td className="px-3 py-3">{owner}</td>
        <td className="px-3 py-3 whitespace-nowrap">{latest ? formatDateTime(latest.uploadedAt) : "—"}</td>
      </tr>
      {open ? (
        <tr className="border-t border-black/5 bg-light-gray/40">
          <td colSpan={8} className="px-3 py-3">
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><a href={onReviseHref}>Upload next revision</a></Button>
              {latest && latest.status !== "approved" ? <Button type="button" size="sm" onClick={onIssue}>Issue Rev {latest.revision}</Button> : null}
            </div>
            <table className="mt-3 w-full min-w-[720px] text-sm">
              <thead className="text-left text-[11px] text-muted-foreground">
                <tr>
                  {["Rev", "File", "Note", "By", "Uploaded", "Standing", ""].map((label) => (
                    <th key={label || "download"} className="px-2 py-2 font-medium tracking-wide uppercase">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...item.revisions].reverse().map((revision) => {
                  const person = users.find((user) => user.id === revision.uploadedBy);
                  return (
                    <tr key={revision.id} className="border-t border-black/5">
                      <td className="px-2 py-2 font-mono text-xs">{revision.revision}</td>
                      <td className="px-2 py-2">{revision.fileName}<span className="block text-xs text-black/45">{formatSize(revision.size)}</span></td>
                      <td className="px-2 py-2">{revision.note}</td>
                      <td className="px-2 py-2">{person ? fullName(person) : "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(revision.uploadedAt)}</td>
                      <td className="px-2 py-2"><StandingBadge value={standing(item, revision)} /></td>
                      <td className="px-2 py-2 text-right">
                        <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={() => downloadRevision(item, revision)}>Download</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <AccessEditor access={item.access} onSave={onAccess} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function AccessEditor({ access, onSave }: { access: UserRole[]; onSave: (access: UserRole[]) => void }) {
  const [roles, setRoles] = useState(access);
  const [seen, setSeen] = useState(access.join(","));
  const key = access.join(",");
  if (key !== seen) {
    setSeen(key);
    setRoles(access);
  }
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(roles);
      }}
    >
      <p className="text-xs font-medium text-black/55">Who can open it</p>
      {userRoles.map((role) => (
        <label key={role} className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={role === "administrator" || roles.includes(role)}
            disabled={role === "administrator"}
            onChange={(event) => {
              setRoles(event.target.checked ? [...roles, role] : roles.filter((item) => item !== role));
            }}
          />
          {roleLabel[role]}
        </label>
      ))}
      <Button type="submit" size="sm" variant="outline">Save access</Button>
    </form>
  );
}

function RegisterForm({
  projects,
  users,
  csrfToken,
  serverError,
}: {
  projects: { id: string; code: string; name: string }[];
  users: { id: string; firstName: string; lastName: string }[];
  csrfToken: string;
  serverError?: string | null;
}) {
  return (
    <form
      className="grid gap-3"
      action="/api/documents"
      method="post"
      encType="multipart/form-data"
    >
      <input type="hidden" name="csrfToken" value={csrfToken} />
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1"><Label>Number</Label><Input name="number" placeholder="DWG-KGL-015" required /></label>
        <label className="grid gap-1"><Label>Title</Label><Input name="title" required /></label>
        <label className="grid gap-1">
          <Label>Project</Label>
          <select name="projectId" className={selectClass} defaultValue={projects[0]?.id ?? ""}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <Label>Category</Label>
          <select name="category" className={selectClass} defaultValue="drawing">
            {categories.map((item) => <option key={item} value={item}>{documentCategoryLabel[item]}</option>)}
          </select>
        </label>
        <label className="grid gap-1"><Label>Discipline</Label><Input name="discipline" defaultValue="General" /></label>
        <label className="grid gap-1">
          <Label>Owner</Label>
          <select name="ownerId" className={selectClass} defaultValue={users[0]?.id ?? ""}>
            {users.map((user) => <option key={user.id} value={user.id}>{fullName(user)}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <Label>Rev 01 standing</Label>
          <select name="status" className={selectClass} defaultValue="in_review">
            <option value="draft">Draft — not for construction</option>
            <option value="in_review">In review — not for construction</option>
            <option value="approved">Issued — build from this</option>
          </select>
        </label>
        <label className="grid gap-1"><Label>File</Label><Input name="file" type="file" required /></label>
      </div>
      <label className="grid gap-1"><Label>Revision note</Label><Textarea name="note" /></label>
      <div className="flex flex-wrap gap-3">
        <input type="hidden" name="access" value="administrator" />
        {userRoles.map((role) => (
          <label key={role} className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" name="access" value={role} defaultChecked disabled={role === "administrator"} />
            {roleLabel[role]}
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button asChild variant="outline"><a href="/admin/documents">Cancel</a></Button>
        <Button type="submit">Register</Button>
      </div>
    </form>
  );
}

function ReviseForm({
  documents,
  initialId,
  csrfToken,
  serverError,
}: {
  documents: ProjectDocument[];
  initialId: string;
  csrfToken: string;
  serverError?: string | null;
}) {
  const current = documents.find((item) => item.id === initialId);
  const issued = current ? issuedRevision(current) : null;
  return (
    <form
      className="grid gap-3"
      action="/api/documents/revise"
      method="post"
      encType="multipart/form-data"
    >
      <input type="hidden" name="csrfToken" value={csrfToken} />
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      <label className="grid gap-1">
        <Label>Document</Label>
        <select name="documentId" className={selectClass} defaultValue={initialId}>
          {documents.map((item) => <option key={item.id} value={item.id}>{item.number} — {item.title}</option>)}
        </select>
      </label>
      <p className="text-sm text-black/60">
        {issued ? `Construction stays on Rev ${issued.revision} until you issue the new file.` : "Nothing is issued yet. This upload still starts in review."}
      </p>
      <label className="grid gap-1"><Label>File</Label><Input name="file" type="file" required /></label>
      <label className="grid gap-1"><Label>What changed</Label><Textarea name="note" /></label>
      <div className="flex justify-end gap-2">
        <Button asChild variant="outline"><a href="/admin/documents">Cancel</a></Button>
        <Button type="submit">Upload as in review</Button>
      </div>
    </form>
  );
}

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

type InvoiceExtraction = {
  fileName: string;
  fileType: string;
  textExtracted: boolean;
  confidence: "low" | "medium" | "high";
  warnings: string[];
  fields: Record<string, unknown>;
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

function ExtractInvoicePanel({ csrfToken }: { csrfToken: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<InvoiceExtraction | null>(null);
  const [fields, setFields] = useState<InvoiceFields>(toEditableFields(undefined));
  const [accepted, setAccepted] = useState(false);

  async function onExtract(event: React.FormEvent) {
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

  function acceptedPayload() {
    return {
      acceptedAt: new Date().toISOString(),
      sourceFile: extraction ? { fileName: extraction.fileName, fileType: extraction.fileType } : null,
      confidence: extraction?.confidence ?? "low",
      warnings: extraction?.warnings ?? [],
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
              <p className="font-medium">Review warnings</p>
              <ul className="mt-1 list-disc pl-5">
                {extraction.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1"><Label>Invoice number</Label><Input value={fields.invoiceNumber} onChange={(e) => updateField("invoiceNumber", e.target.value)} /></label>
            <label className="grid gap-1"><Label>Vendor / supplier</Label><Input value={fields.vendorName} onChange={(e) => updateField("vendorName", e.target.value)} /></label>
            <label className="grid gap-1"><Label>Invoice date</Label><Input type="date" value={fields.invoiceDate} onChange={(e) => updateField("invoiceDate", e.target.value)} /></label>
            <label className="grid gap-1"><Label>Due date</Label><Input type="date" value={fields.dueDate} onChange={(e) => updateField("dueDate", e.target.value)} /></label>
            <label className="grid gap-1"><Label>Currency</Label><Input value={fields.currency} onChange={(e) => updateField("currency", e.target.value)} placeholder="RWF, USD..." /></label>
            <label className="grid gap-1"><Label>PO number</Label><Input value={fields.poNumber} onChange={(e) => updateField("poNumber", e.target.value)} /></label>
            <label className="grid gap-1"><Label>Subtotal</Label><Input type="number" step="0.01" value={fields.subtotal} onChange={(e) => updateField("subtotal", e.target.value)} /></label>
            <label className="grid gap-1"><Label>Tax / VAT</Label><Input type="number" step="0.01" value={fields.tax} onChange={(e) => updateField("tax", e.target.value)} /></label>
            <label className="grid gap-1"><Label>Total</Label><Input type="number" step="0.01" value={fields.total} onChange={(e) => updateField("total", e.target.value)} /></label>
            <label className="grid gap-1"><Label>Project reference</Label><Input value={fields.projectReference} onChange={(e) => updateField("projectReference", e.target.value)} /></label>
          </div>
          <label className="grid gap-1"><Label>Notes</Label><Textarea value={fields.notes} onChange={(e) => updateField("notes", e.target.value)} placeholder="Review notes or corrections..." /></label>

          <details className="rounded-lg border border-black/5 bg-white px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-black/70">Raw text preview</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-black/60">{extraction.rawTextPreview || "No text extracted."}</pre>
          </details>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={acceptMetadata}>Accept metadata</Button>
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

function StandingBadge({ value }: { value: ReturnType<typeof standing> }) {
  const tone = value === "issued" ? "green" : value === "in_review" ? "amber" : "slate";
  return <Badge tone={tone}>{standingLabel[value]}</Badge>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-black/5 bg-card px-4 py-3">
      <p className="text-xs text-black/45">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function downloadRevision(item: ProjectDocument, revision: DocumentRevision) {
  const anchor = window.document.createElement("a");
  if (revision.fileKey) {
    anchor.href = `/api/documents/file?documentId=${encodeURIComponent(item.id)}&revisionId=${encodeURIComponent(revision.id)}`;
    anchor.download = revision.fileName;
    anchor.rel = "noopener";
    anchor.click();
    return;
  }
  if (revision.dataUrl) {
    anchor.href = revision.dataUrl;
    anchor.download = revision.fileName;
    anchor.click();
    return;
  }
  const text = [
    item.title,
    `${item.number} Rev ${revision.revision}`,
    revision.note,
    "",
    "Demonstration record. A seeded revision has no stored bytes.",
    "A file uploaded in this preview downloads as the original.",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  anchor.href = url;
  anchor.download = revision.fileName.replace(/\.[^.]+$/, "") + "-record.txt";
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
