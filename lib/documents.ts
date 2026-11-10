import { daysUntil } from "@/lib/utils";
import type { DocumentRevision, ProjectDocument, RevisionStatus } from "@/types";

export const documentCategoryLabel = {
  drawing: "Drawing",
  contract: "Contract",
  boq: "BOQ",
  photograph: "Site photograph",
  technical: "Technical document",
  minutes: "Meeting minutes",
  inspection: "Inspection",
  correspondence: "Correspondence",
} as const;

export const revisionStatusLabel: Record<RevisionStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
};

export const standingLabel = {
  issued: "Issued",
  in_review: "In review",
  draft: "Draft",
  superseded: "Superseded",
} as const;

export function latestRevision(document: ProjectDocument) {
  return document.revisions[document.revisions.length - 1] ?? null;
}

/** The newest approved revision. Site work uses this, not a file that is still in review. */
export function issuedRevision(document: ProjectDocument) {
  for (let index = document.revisions.length - 1; index >= 0; index -= 1) {
    if (document.revisions[index].status === "approved") return document.revisions[index];
  }
  return null;
}

export function standing(document: ProjectDocument, revision: DocumentRevision) {
  const latest = latestRevision(document);
  if (!latest || revision.id !== latest.id) return "superseded" as const;
  if (revision.status === "approved") return "issued" as const;
  return revision.status;
}

export function issueWarning(document: ProjectDocument) {
  const latest = latestRevision(document);
  if (!latest || latest.status === "approved") return null;
  const issued = issuedRevision(document);
  const state = latest.status === "in_review" ? "in review" : "still a draft";
  const age = -daysUntil(latest.uploadedAt);
  const wait = latest.status === "in_review" && age > 7 ? ` It has been waiting ${age} days.` : "";
  if (issued) {
    return `${document.number} Rev ${latest.revision} is ${state} and must not be built from. The issued revision is Rev ${issued.revision}.${wait}`;
  }
  return `${document.number} has no issued revision. Rev ${latest.revision} is ${state}.${wait}`;
}

export function nextRevisionCode(document: ProjectDocument) {
  const latest = latestRevision(document);
  const current = latest ? Number(latest.revision) : 0;
  return String((Number.isFinite(current) ? current : document.revisions.length) + 1).padStart(2, "0");
}
