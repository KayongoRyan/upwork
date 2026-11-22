"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { useAdmin } from "@/lib/data/admin-store";
import { inquiryStatusLabel } from "@/lib/labels";
import { formatDate, formatDateTime, fullName } from "@/lib/utils";
import type { InquiryStatus, VertexaInquiry } from "@/types";

const statusTone: Record<InquiryStatus, "amber" | "navy" | "green"> = {
  received: "amber",
  assigned: "navy",
  closed: "green",
};

export function InquiryDetail({ id }: { id: string }) {
  const router = useRouter();
  const { users, projects, viewer } = useAdmin();
  const managers = users.filter((user) => user.role === "project_manager");

  const [inquiry, setInquiry] = useState<VertexaInquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<InquiryStatus>("received");
  const [recipientId, setRecipientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/vertexa/inquiries/${id}`, { cache: "no-store" });
        if (response.status === 404) throw new Error("not_found");
        if (!response.ok) throw new Error("unavailable");
        const data = (await response.json()) as { inquiry?: VertexaInquiry };
        if (cancelled) return;
        if (!data.inquiry) throw new Error("not_found");
        setInquiry(data.inquiry);
        setStatus(data.inquiry.status);
        setRecipientId(data.inquiry.recipientId ?? "");
        setProjectId(data.inquiry.projectId ?? "");
      } catch (err) {
        if (!cancelled) {
          setInquiry(null);
          setError(err instanceof Error && err.message === "not_found" ? "Inquiry not found." : "Could not load this inquiry from the Vertexa API.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function save(patch: Record<string, unknown>, kind: "details" | "note") {
    if (kind === "note") setNoteSaving(true);
    else setSaving(true);
    try {
      const response = await fetch(`/api/vertexa/inquiries/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": viewer?.csrfToken ?? "" },
        body: JSON.stringify(patch),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; inquiry?: VertexaInquiry; error?: string } | null;
      if (!response.ok || !data?.ok || !data.inquiry) {
        const code = data?.error ?? "unavailable";
        const message =
          code === "invalid-transition"
            ? "That status change is not allowed. Move received → assigned → closed."
            : code === "not_found"
              ? "Inquiry not found."
              : "Could not save changes. Check the API and try again.";
        toast.error(message);
        return;
      }
      setInquiry(data.inquiry);
      setStatus(data.inquiry.status);
      setRecipientId(data.inquiry.recipientId ?? "");
      setProjectId(data.inquiry.projectId ?? "");
      if (kind === "note") setNote("");
      toast.success(kind === "note" ? "Note added." : "Inquiry updated.");
      router.refresh();
    } finally {
      if (kind === "note") setNoteSaving(false);
      else setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Inquiry" description="Loading from the Vertexa API…" />
        <div className="rounded-[22px] border border-black/5 bg-card p-6 text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (error || !inquiry) {
    return (
      <div>
        <PageHeader title="Inquiry" description="Public-site lead detail." actions={<Button asChild variant="outline"><Link href="/admin/inquiries">Back to inquiries</Link></Button>} />
        <EmptyState title="Inquiry unavailable" body={error ?? "Not found."} />
      </div>
    );
  }

  const allowedStatuses = nextStatuses(inquiry.status);
  const linkedProject = projects.find((project) => project.id === projectId || project.id === inquiry.projectId);

  return (
    <div>
      <PageHeader
        title={inquiry.name}
        description={`${inquiry.serviceName} · ${inquiry.id}`}
        actions={<Button asChild variant="outline"><Link href="/admin/inquiries">Back to inquiries</Link></Button>}
      />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[22px] border border-black/5 bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[inquiry.status]}>{inquiryStatusLabel[inquiry.status]}</Badge>
            <span className="text-xs text-muted-foreground">Received {formatDateTime(inquiry.createdAt)}</span>
            <span className="text-xs text-muted-foreground">Updated {formatDateTime(inquiry.updatedAt)}</span>
          </div>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Detail label="Email" value={inquiry.email} />
            <Detail label="Phone" value={inquiry.phone || "—"} />
            <Detail label="Location" value={inquiry.location || "—"} />
            <Detail label="Budget" value={inquiry.budget || "—"} />
            <Detail label="Expected start" value={inquiry.startDate ? formatDate(inquiry.startDate) : "—"} />
            <Detail label="Scope" value={inquiry.scope} />
          </dl>

          <div className="mt-5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Message</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{inquiry.message}</p>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <h2 className="text-sm font-semibold">Notes</h2>
            {inquiry.notes.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No notes yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {[...inquiry.notes].reverse().map((entry) => (
                  <li key={entry.id} className="rounded-xl bg-black/[0.03] p-3">
                    <p className="text-sm whitespace-pre-wrap">{entry.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{entry.author} · {formatDateTime(entry.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mt-4 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!note.trim()) return;
                void save({ note: note.trim(), author: "Administrator" }, "note");
              }}
            >
              <Field label="Add note" htmlFor="inq-note">
                <Textarea id="inq-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Follow-up, call outcome, or handoff detail" />
              </Field>
              <div>
                <Button type="submit" variant="outline" disabled={noteSaving || !note.trim()}>
                  {noteSaving ? "Saving…" : "Add note"}
                </Button>
              </div>
            </form>
          </div>
        </section>

        <section className="grid gap-4 self-start">
          <div className="rounded-[22px] border border-black/5 bg-card p-5">
            <h2 className="text-sm font-semibold">Workflow</h2>
            <p className="mt-1 text-sm text-muted-foreground">Status moves forward only: received → assigned → closed.</p>
            <form
              className="mt-4 grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save(
                  {
                    status,
                    recipientId,
                    projectId: projectId || null,
                  },
                  "details",
                );
              }}
            >
              <Field label="Status" htmlFor="inq-status">
                <select
                  id="inq-status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as InquiryStatus)}
                  className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm"
                >
                  <option value={inquiry.status}>{inquiryStatusLabel[inquiry.status]} (current)</option>
                  {allowedStatuses.map((value) => (
                    <option key={value} value={value}>{inquiryStatusLabel[value]}</option>
                  ))}
                </select>
              </Field>

              <Field label="Assigned project manager" htmlFor="inq-recipient" hint="Updates the inquiry record. Existing inbox notices keep their original recipient.">
                <select
                  id="inq-recipient"
                  value={recipientId}
                  onChange={(event) => setRecipientId(event.target.value)}
                  className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {managers.map((user) => (
                    <option key={user.id} value={user.id}>{fullName(user)} ({user.id})</option>
                  ))}
                </select>
              </Field>

              <Field label="Linked CPMIS project" htmlFor="inq-project">
                <select
                  id="inq-project"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm"
                >
                  <option value="">No linked project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name} ({project.code})</option>
                  ))}
                </select>
              </Field>

              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
                {linkedProject ? (
                  <Button asChild variant="outline">
                    <Link href={`/admin/projects?focus=${linkedProject.id}`}>Open project</Link>
                  </Button>
                ) : null}
              </div>
            </form>
          </div>

          <div className="rounded-[22px] border border-black/5 bg-card p-5">
            <h2 className="text-sm font-semibold">Quick facts</h2>
            <dl className="mt-3 grid gap-3 text-sm">
              <Detail label="Service" value={inquiry.serviceName} />
              <Detail label="Recipient" value={inquiry.recipientId || "Unassigned"} />
              <Detail label="Linked project" value={linkedProject ? `${linkedProject.name} (${linkedProject.code})` : inquiry.projectId || "None"} />
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}

function nextStatuses(current: InquiryStatus): InquiryStatus[] {
  if (current === "received") return ["assigned"];
  if (current === "assigned") return ["closed"];
  return [];
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm break-words">{value}</dd>
    </div>
  );
}
