import { randomBytes } from "node:crypto";
import { managerIdForService, serviceLabel } from "../constants/vertexa.js";
import { ensureDb } from "../db.js";
import { formatInquiryDetailMessage, inquiryNotificationTitle } from "../lib/formatInquiryMessage.js";
import { validateInquiryInput } from "../lib/validateInquiry.js";

function newInquiryId() {
  return `inq-${randomBytes(5).toString("hex")}`;
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
  const recipientId = managerIdForService(data.service);
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
    status: "received",
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

  const pmNotice = {
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
  };

  const db = await ensureDb();
  await db.collection("inquiries").insertOne(inquiry);
  await db.collection("notifications").insertMany([adminNotice, pmNotice]);

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
  const limit = Math.min(Number(query.limit) || 50, 100);

  const items = await db
    .collection("inquiries")
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return items.map((item) => ({
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
    status: item.status,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
  }));
}