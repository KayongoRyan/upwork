"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import type { DocumentCategory, DocumentRevision, ProjectDocument, RevisionStatus, UserRole } from "@/types";

const selectClass = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";
const categories = Object.keys(documentCategoryLabel) as DocumentCategory[];
const MAX_BYTES = 512 * 1024;

export function DocumentsView() {
  const data = useAdmin();
  const documents = data.documents ?? [];
  const params = useSearchParams();
  const requested = params.get("project");
  const requestedDoc = params.get("doc");
  const register = params.get("register") === "1";
  const revise = params.get("revise");
  const [seen, setSeen] = useState(requested);
  const [seenDoc, setSeenDoc] = useState(requestedDoc);
  const [projectId, setProjectId] = useState(requested && data.projects.some((item) => item.id === requested) ? requested : "all");
  const [category, setCategory] = useState<DocumentCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(requestedDoc);
  const [saved, setSaved] = useState(false);
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
            <Button asChild variant="outline"><a href="/admin/documents?revise=1">Upload revision</a></Button>
            <Button asChild><a href="/admin/documents?register=1">Register document</a></Button>
          </>
        }
      />
      {register && !saved ? (
        <section className="mb-4 rounded-[22px] border border-black/5 bg-card p-4">
          <h2 className="text-base font-semibold">Register document</h2>
          <p className="mt-1 mb-4 text-sm text-black/55">The first file is Rev 01. Leave it in review unless it is ready to build from.</p>
          <RegisterForm
            projects={data.projects}
            users={data.users}
            serverError={params.get("error")}
            onSubmit={(document, revision) => {
              const result = data.registerDocument(document, revision);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(revision.status === "approved" ? "Document issued as Rev 01." : "Document registered. Rev 01 is not issued.");
              setSaved(true);
              window.history.replaceState(null, "", "/admin/documents");
            }}
          />
        </section>
      ) : null}
      {revise && !register && !saved ? (
        <section className="mb-4 rounded-[22px] border border-black/5 bg-card p-4">
          <h2 className="text-base font-semibold">Upload revision</h2>
          <p className="mt-1 mb-4 text-sm text-black/55">The new file stays in review. The issued revision does not change until you issue this one.</p>
          {documents.length === 0 ? <p className="text-sm text-black/55">Register a document before uploading a revision.</p> : (
            <ReviseForm
              key={revise}
              documents={documents}
              initialId={documents.some((item) => item.id === revise) ? revise : documents[0].id}
              serverError={params.get("error")}
              onSubmit={(documentId, revision) => {
                const result = data.reviseDocument(documentId, revision);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Revision uploaded. It is not issued.");
                setSaved(true);
                setOpenId(documentId);
                window.history.replaceState(null, "", `/admin/documents?doc=${documentId}`);
              }}
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
                    onIssue={() => {
                      const result = data.issueRevision(item.id);
                      if (!result.ok) toast.error(result.error);
                      else toast.success(`${item.number} issued. Earlier revisions are superseded.`);
                    }}
                    onAccess={(access) => {
                      const result = data.setDocumentAccess(item.id, access);
                      if (!result.ok) toast.error(result.error);
                      else toast.success("Access updated.");
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
  serverError,
  onSubmit,
}: {
  projects: { id: string; code: string; name: string }[];
  users: { id: string; firstName: string; lastName: string }[];
  serverError?: string | null;
  onSubmit: (document: Omit<ProjectDocument, "id" | "revisions">, revision: Omit<DocumentRevision, "id" | "revision" | "uploadedAt">) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="grid gap-3"
      action="/api/documents"
      method="post"
      encType="multipart/form-data"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const file = data.get("file");
        if (!(file instanceof File) || file.size === 0) {
          toast.error("Choose a file.");
          return;
        }
        setBusy(true);
        const access = data.getAll("access").filter((value): value is UserRole => typeof value === "string");
        readUpload(file)
          .then((upload) => {
            onSubmit(
              {
                projectId: String(data.get("projectId") ?? ""),
                number: String(data.get("number") ?? ""),
                title: String(data.get("title") ?? ""),
                category: String(data.get("category") ?? "drawing") as DocumentCategory,
                discipline: String(data.get("discipline") ?? "General"),
                ownerId: String(data.get("ownerId") ?? ""),
                access,
              },
              { ...upload, note: String(data.get("note") ?? "").trim(), status: String(data.get("status") ?? "in_review") as RevisionStatus, uploadedBy: "u-admin" },
            );
          })
          .catch((error: Error) => toast.error(error.message))
          .finally(() => setBusy(false));
      }}
    >
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
        {userRoles.map((role) => (
          <label key={role} className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" name="access" value={role} defaultChecked disabled={role === "administrator"} />
            {roleLabel[role]}
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button asChild variant="outline"><a href="/admin/documents">Cancel</a></Button>
        <Button type="submit" disabled={busy}>{busy ? "Reading file" : "Register"}</Button>
      </div>
    </form>
  );
}

function ReviseForm({
  documents,
  initialId,
  serverError,
  onSubmit,
}: {
  documents: ProjectDocument[];
  initialId: string;
  serverError?: string | null;
  onSubmit: (documentId: string, revision: Omit<DocumentRevision, "id" | "revision" | "uploadedAt" | "status">) => void;
}) {
  const [busy, setBusy] = useState(false);
  const current = documents.find((item) => item.id === initialId);
  const issued = current ? issuedRevision(current) : null;
  return (
    <form
      className="grid gap-3"
      action="/api/documents/revise"
      method="post"
      encType="multipart/form-data"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const file = data.get("file");
        if (!(file instanceof File) || file.size === 0) {
          toast.error("Choose a file.");
          return;
        }
        setBusy(true);
        readUpload(file)
          .then((upload) => onSubmit(String(data.get("documentId") ?? initialId), { ...upload, note: String(data.get("note") ?? "").trim(), uploadedBy: "u-admin" }))
          .catch((error: Error) => toast.error(error.message))
          .finally(() => setBusy(false));
      }}
    >
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
        <Button type="submit" disabled={busy}>{busy ? "Reading file" : "Upload as in review"}</Button>
      </div>
    </form>
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

function readUpload(file: File) {
  if (file.size > MAX_BYTES) return Promise.reject(new Error("Keep the preview file under 512 KB."));
  return new Promise<{ fileName: string; fileType: string; size: number; dataUrl: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ fileName: file.name, fileType: file.type || "application/octet-stream", size: file.size, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function downloadRevision(item: ProjectDocument, revision: DocumentRevision) {
  const anchor = window.document.createElement("a");
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
