import { randomBytes } from "node:crypto";
import { serviceLabel } from "../constants/vertexa.js";
import { ensureDb } from "../db.js";
import { formatInquiryDetailMessage, inquiryNotificationTitle } from "../lib/formatInquiryMessage.js";
import { validateInquiryInput } from "../lib/validateInquiry.js";

const INQUIRY_ID = /^inq-[a-z0-9]+$/;
const INQUIRY_STATUSES = new Set(["received", "assigned", "closed"]);
/** A lead moves forward only: received → assigned → closed. */
const STATUS_TRANSITIONS = {
  received: ["assigned"],
  assigned: ["closed"],
  closed: [],
};

function newInquiryId() {
  return `inq-${randomBytes(5).toString("hex")}`;
}

function serializeInquiry(item) {
  return {
    id: item._id,
    scope: item.scope,
    serviceId: item.serviceId,
    serviceName: item.serviceName,
    name: item.name,
    email: item.email,
    phone: item.phone,
    location: item.location,
    budget: item.budget,
    startDate: item.startDate,
    message: item.message,
    recipientId: item.recipientId,
    projectId: item.projectId ?? null,
    status: item.status,
    notes: (item.notes ?? []).map((note) => ({
      ...note,
      createdAt: note.createdAt instanceof Date ? note.createdAt.toISOString() : note.createdAt,
    })),
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
  };
}

/**
 * @param {Record<string, unknown>} body
 */
export async function createInquiry(body) {
  const validation = validateInquiryInput(body);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const data = validation.data;
  const now = new Date();
  const inquiryId = newInquiryId();
  // The trusted BFF resolves the project manager from the live team roster.
  const recipientId = data.recipientId ?? null;
  const serviceName = data.service === "general" ? "General enquiry" : serviceLabel(data.service);

  const inquiry = {
    _id: inquiryId,
    scope: data.scope,
    serviceId: data.service,
    serviceName,
    name: data.name,
    email: data.email,
    phone: data.phone,
    location: data.location,
    budget: data.budget,
    startDate: data.startDate,
    message: data.message,
    recipientId,
    projectId: null,
    status: "received",
    notes: [],
    createdAt: now,
    updatedAt: now,
  };

  const detailMessage = formatInquiryDetailMessage({
    service: data.service,
    name: data.name,
    email: data.email,
    phone: data.phone,
    location: data.location,
    budget: data.budget,
    startDate: data.startDate,
    message: data.message,
  });

  const title = inquiryNotificationTitle(data.service);

  const adminNotice = {
    _id: `ntf-${inquiryId}-admin`,
    inquiryId,
    audience: "admin",
    recipientId: null,
    type: "system",
    title,
    message: detailMessage,
    senderName: data.name,
    source: "vertexa",
    read: false,
    createdAt: now,
  };

  const pmNotice = recipientId
    ? {
        _id: `ntf-${inquiryId}-pm`,
        inquiryId,
        audience: "pm",
        recipientId,
        type: "system",
        title,
        message: detailMessage,
        senderName: data.name,
        source: "vertexa",
        read: false,
        createdAt: now,
      }
    : null;

  const db = await ensureDb();
  await db.collection("inquiries").insertOne(inquiry);
  await db
    .collection("notifications")
    .insertMany(pmNotice ? [adminNotice, pmNotice] : [adminNotice]);

  return {
    ok: true,
    inquiry: {
      id: inquiryId,
      status: inquiry.status,
      recipientId,
      createdAt: now.toISOString(),
    },
  };
}

/**
 * @param {object} query
 */
export async function listNotifications(query) {
  const db = await ensureDb();
  const filter = {};

  if (query.recipientId) {
    filter.recipientId = String(query.recipientId);
  } else if (query.audience === "admin") {
    filter.audience = "admin";
  }

  if (query.read === "true") filter.read = true;
  if (query.read === "false") filter.read = false;

  const limit = Math.min(Number(query.limit) || 50, 100);

  const items = await db
    .collection("notifications")
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return items.map((item) => ({
    id: item._id,
    inquiryId: item.inquiryId,
    audience: item.audience,
    recipientId: item.recipientId,
    type: item.type,
    title: item.title,
    message: item.message,
    senderName: item.senderName,
    source: item.source,
    read: item.read,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
  }));
}

export async function listInquiries(query) {
  const db = await ensureDb();
  const filter = {};
  const status = String(query.status ?? "all");
  if (INQUIRY_STATUSES.has(status)) filter.status = status;

  const search = String(query.search ?? "").trim();
  if (search) {
    const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = ["name", "email", "serviceName", "location", "message"].map((field) => ({ [field]: pattern }));
  }

  const limit = Math.min(Number(query.limit) || 50, 100);
  const items = await db
    .collection("inquiries")
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return items.map(serializeInquiry);
}

export async function getInquiry(id) {
  if (!INQUIRY_ID.test(String(id))) return null;
  const db = await ensureDb();
  const item = await db.collection("inquiries").findOne({ _id: String(id) });
  return item ? serializeInquiry(item) : null;
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} body
 */
export async function updateInquiry(id, body) {
  const current = await getInquiry(id);
  if (!current) return { ok: false, error: "not_found" };

  const set = {};
  const now = new Date();

  if (body.status !== undefined) {
    const status = String(body.status);
    if (!INQUIRY_STATUSES.has(status)) return { ok: false, error: "invalid-status" };
    if (status !== current.status && !STATUS_TRANSITIONS[current.status]?.includes(status)) {
      return { ok: false, error: "invalid-transition" };
    }
    set.status = status;
  }

  if (body.recipientId !== undefined) {
    if (typeof body.recipientId !== "string" || body.recipientId.length < 2 || body.recipientId.length > 80) {
      return { ok: false, error: "invalid-recipient" };
    }
    set.recipientId = body.recipientId;
  }

  if (body.projectId !== undefined) {
    if (body.projectId !== null && (typeof body.projectId !== "string" || body.projectId.length > 80)) {
      return { ok: false, error: "invalid-project" };
    }
    set.projectId = body.projectId;
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (body.note !== undefined && (note.length < 1 || note.length > 1000)) {
    return { ok: false, error: "invalid-note" };
  }

  set.updatedAt = now;
  const update = { $set: set };
  if (note) {
    update.$push = {
      notes: {
        id: `note-${randomBytes(4).toString("hex")}`,
        author: typeof body.author === "string" && body.author.trim() ? body.author.trim() : "Administrator",
        body: note,
        createdAt: now,
      },
    };
  }

  const db = await ensureDb();
  await db.collection("inquiries").updateOne({ _id: String(id) }, update);
  const updated = await getInquiry(id);
  return { ok: true, inquiry: updated };
}