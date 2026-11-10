import type { DocumentRevision, ProjectDocument, RevisionStatus, UserRole } from "@/types";

const site: UserRole[] = ["administrator", "project_manager", "site_engineer", "quantity_surveyor"];
const commercial: UserRole[] = ["administrator", "project_manager", "quantity_surveyor"];
const management: UserRole[] = ["administrator", "project_manager"];
const field: UserRole[] = ["administrator", "project_manager", "site_engineer"];

export function createDocuments(): ProjectDocument[] {
  return [
    doc("doc-ebb-dwg", "prj-cargo", "DWG-KGL-014", "Cold-room steel general arrangement", "drawing", "Structural", "u-pm-2", site, [
      rev("doc-ebb-dwg-01", "01", "DWG-KGL-014-Rev01.pdf", "application/pdf", 248_000, "Issued for construction.", "approved", "u-pm-2", "2026-08-12T09:00:00Z"),
      rev("doc-ebb-dwg-02", "02", "DWG-KGL-014-Rev02.pdf", "application/pdf", 261_000, "Grid C connection revised and issued.", "approved", "u-pm-2", "2026-09-28T11:20:00Z"),
      rev("doc-ebb-dwg-03", "03", "DWG-KGL-014-Rev03.pdf", "application/pdf", 274_000, "Steel tonnage increased. Not for construction until it is issued.", "in_review", "u-qs-2", "2026-10-21T08:40:00Z"),
    ]),
    doc("doc-ebb-spc", "prj-cargo", "SPC-KGL-08", "Cold store technical specification", "technical", "MEP", "u-qs-2", commercial, [
      rev("doc-ebb-spc-01", "01", "SPC-KGL-08-Rev01.pdf", "application/pdf", 180_000, "Issued specification.", "approved", "u-qs-2", "2026-09-01T10:00:00Z"),
      rev("doc-ebb-spc-02", "02", "SPC-KGL-08-Rev02.pdf", "application/pdf", 192_000, "Plant duty revised and issued.", "approved", "u-qs-2", "2026-10-15T09:30:00Z"),
    ]),
    doc("doc-ebb-boq", "prj-cargo", "KGL-BOQ-06", "Priced bill of quantities", "boq", "Commercial", "u-qs-2", commercial, [
      rev("doc-ebb-boq-01", "01", "KGL-BOQ-06-Rev01.xlsx", "application/vnd.ms-excel", 96_000, "Issued bill.", "approved", "u-qs-2", "2026-06-02T08:00:00Z"),
      rev("doc-ebb-boq-02", "02", "KGL-BOQ-06-Rev02.xlsx", "application/vnd.ms-excel", 104_000, "Measured quantities. Not the issued bill yet.", "in_review", "u-qs-2", "2026-11-04T14:10:00Z"),
    ]),
    doc("doc-ebb-con", "prj-cargo", "KGL-CGT-25-C01", "Works contract", "contract", "Commercial", "u-pm-2", management, [
      rev("doc-ebb-con-01", "01", "KGL-CGT-25-C01.pdf", "application/pdf", 540_000, "Signed contract.", "approved", "u-admin", "2025-05-20T08:00:00Z"),
    ]),
    doc("doc-ebb-photo", "prj-cargo", "PHO-KGL-103", "Apron bay 3 end of shift", "photograph", "Site", "u-se-2", site, [
      rev("doc-ebb-photo-01", "01", "PHO-KGL-103.jpg", "image/jpeg", 820_000, "Shutter still open at the end of the shift.", "approved", "u-se-2", "2026-10-20T17:05:00Z"),
    ]),
    doc("doc-ebb-insp", "prj-cargo", "INS-KGL-09", "Apron bay 3 inspection", "inspection", "Site", "u-se-2", field, [
      rev("doc-ebb-insp-01", "01", "INS-KGL-09.pdf", "application/pdf", 88_000, "Bay 3 did not match the progress figure.", "approved", "u-pm-2", "2026-10-21T08:15:00Z"),
    ]),
    doc("doc-ebb-min", "prj-cargo", "MIN-KGL-14", "Weekly coordination meeting 14", "minutes", "General", "u-pm-2", field, [
      rev("doc-ebb-min-01", "01", "MIN-KGL-14.pdf", "application/pdf", 64_000, "Steel recovery and bay 4 pour agreed.", "approved", "u-pm-2", "2026-11-03T16:00:00Z"),
    ]),
    doc("doc-nbx-dwg", "prj-bypass", "DWG-NBX-110", "Carriageway plan and profile", "drawing", "Civil", "u-pm-1", site, [
      rev("doc-nbx-dwg-04", "04", "DWG-NBX-110-Rev04.pdf", "application/pdf", 410_000, "Issued for setting out.", "approved", "u-pm-1", "2026-08-14T09:00:00Z"),
      rev("doc-nbx-dwg-05", "05", "DWG-NBX-110-Rev05.pdf", "application/pdf", 428_000, "Drainage shop-drawing comments. Do not set out from this revision.", "in_review", "u-qs-1", "2026-11-05T10:40:00Z"),
    ]),
    doc("doc-nbx-con", "prj-bypass", "KGL-NBX-24-C01", "Works contract", "contract", "Commercial", "u-pm-1", management, [
      rev("doc-nbx-con-01", "01", "KGL-NBX-24-C01.pdf", "application/pdf", 610_000, "Signed contract.", "approved", "u-admin", "2025-02-18T08:00:00Z"),
    ]),
    doc("doc-ind-dwg", "prj-industrial", "DWG-BGS-044", "Duct bank sections", "drawing", "MEP", "u-pm-2", site, [
      rev("doc-ind-dwg-02", "02", "DWG-BGS-044-Rev02.pdf", "application/pdf", 220_000, "Issued sections.", "approved", "u-pm-2", "2026-06-30T09:00:00Z"),
      rev("doc-ind-dwg-03", "03", "DWG-BGS-044-Rev03.pdf", "application/pdf", 233_000, "Recovery markup. Draft only.", "draft", "u-pm-2", "2026-11-04T15:20:00Z"),
    ]),
    doc("doc-ind-let", "prj-industrial", "LTR-BGS-19", "Recovery plan request", "correspondence", "General", "u-pm-2", management, [
      rev("doc-ind-let-01", "01", "LTR-BGS-19.pdf", "application/pdf", 48_000, "Sent to the utility contractor.", "approved", "u-pm-2", "2026-11-04T15:30:00Z"),
    ]),
    doc("doc-drain-asb", "prj-drain", "DWG-NYB-ASB", "As-built channel plan", "drawing", "Civil", "u-pm-2", site, [
      rev("doc-drain-asb-01", "01", "DWG-NYB-ASB-Rev01.pdf", "application/pdf", 300_000, "As-built issued at handover.", "approved", "u-pm-2", "2026-08-28T12:00:00Z"),
    ]),
    doc("doc-drain-pc", "prj-drain", "PC-NYB-01", "Practical completion certificate", "inspection", "General", "u-pm-2", management, [
      rev("doc-drain-pc-01", "01", "PC-NYB-01.pdf", "application/pdf", 72_000, "Practical completion recorded.", "approved", "u-pm-2", "2026-08-30T16:30:00Z"),
    ]),
    doc("doc-hosp-dwg", "prj-hospital", "DWG-RWM-020", "Theatre layout", "drawing", "Architectural", "u-pm-3", site, [
      rev("doc-hosp-dwg-01", "01", "DWG-RWM-020-Rev01.pdf", "application/pdf", 266_000, "Issued before the pause.", "approved", "u-pm-3", "2026-09-12T09:00:00Z"),
      rev("doc-hosp-dwg-02", "02", "DWG-RWM-020-Rev02.pdf", "application/pdf", 271_000, "Fit-out change during the pause. Not issued.", "in_review", "u-pm-3", "2026-10-20T11:00:00Z"),
    ]),
    doc("doc-bridge-dwg", "prj-bridge", "DWG-NBR-006", "Bearing schedule", "drawing", "Structural", "u-se-3", site, [
      rev("doc-bridge-dwg-01", "01", "DWG-NBR-006-Rev01.pdf", "application/pdf", 140_000, "First issue.", "approved", "u-se-3", "2026-07-19T14:00:00Z"),
      rev("doc-bridge-dwg-02", "02", "DWG-NBR-006-Rev02.pdf", "application/pdf", 148_000, "Night-closure bearings issued.", "approved", "u-se-3", "2026-11-01T09:10:00Z"),
    ]),
    doc("doc-gulu-boq", "prj-gulu", "BOQ-MSZ-02", "Gravel measurement note", "boq", "Commercial", "u-qs-3", commercial, [
      rev("doc-gulu-boq-01", "01", "BOQ-MSZ-02-Rev01.pdf", "application/pdf", 54_000, "Stockpile is short. Nothing has been issued.", "in_review", "u-qs-3", "2026-11-03T11:05:00Z"),
    ]),
    doc("doc-sch-dwg", "prj-schools", "DWG-HUY-SK", "Sketch layouts", "drawing", "Architectural", "u-pm-1", site, [
      rev("doc-sch-dwg-01", "01", "DWG-HUY-SK-Rev01.pdf", "application/pdf", 120_000, "Design sketch. Not for construction.", "draft", "u-pm-1", "2026-10-18T08:30:00Z"),
    ]),
  ];
}

function doc(
  id: string,
  projectId: string,
  number: string,
  title: string,
  category: ProjectDocument["category"],
  discipline: string,
  ownerId: string,
  access: UserRole[],
  revisions: DocumentRevision[],
): ProjectDocument {
  return { id, projectId, number, title, category, discipline, ownerId, access, revisions };
}

function rev(
  id: string,
  revision: string,
  fileName: string,
  fileType: string,
  size: number,
  note: string,
  status: RevisionStatus,
  uploadedBy: string,
  uploadedAt: string,
): DocumentRevision {
  return { id, revision, fileName, fileType, size, note, status, uploadedBy, uploadedAt };
}
