import { Router } from "express";
import { config } from "../config.js";
import { ensureDb } from "../db.js";
import { requireAdminAuth } from "../middleware/requireAdminAuth.js";
import { listNotifications } from "../services/inquiryService.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAdminAuth);

notificationsRouter.get("/", async (req, res) => {
  try {
    const items = await listNotifications(req.query);
    res.json({ ok: true, items });
  } catch (error) {
    console.error(`[${req.requestId}]`, error);
    res.status(500).json({ ok: false, error: "server_error", requestId: req.requestId, apiVersion: config.apiVersion });
  }
});

notificationsRouter.patch("/read-all", async (req, res) => {
  try {
    const audience = typeof req.body?.audience === "string" ? req.body.audience : undefined;
    const recipientId = typeof req.body?.recipientId === "string" ? req.body.recipientId : undefined;
    const filter = { read: false };
    if (audience === "admin") filter.audience = "admin";
    else if (recipientId) filter.recipientId = recipientId;
    else if (audience) filter.audience = audience;
    else {
      return res.status(400).json({ ok: false, error: "invalid-request", requestId: req.requestId, apiVersion: config.apiVersion });
    }
    const db = await ensureDb();
    const result = await db.collection("notifications").updateMany(filter, { $set: { read: true } });
    res.json({ ok: true, updated: result.modifiedCount ?? 0 });
  } catch (error) {
    console.error(`[${req.requestId}]`, error);
    res.status(500).json({ ok: false, error: "server_error", requestId: req.requestId, apiVersion: config.apiVersion });
  }
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  try {
    const id = req.params.id;
    const read = req.body?.read !== false;
    const db = await ensureDb();
    const result = await db.collection("notifications").updateOne({ _id: id }, { $set: { read } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ ok: false, error: "not_found", requestId: req.requestId, apiVersion: config.apiVersion });
    }
    res.json({ ok: true, id, read });
  } catch (error) {
    console.error(`[${req.requestId}]`, error);
    res.status(500).json({ ok: false, error: "server_error", requestId: req.requestId, apiVersion: config.apiVersion });
  }
});
