import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.js";
import { listNotifications } from "../services/inquiryService.js";
import { ensureDb } from "../db.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAdminAuth);

notificationsRouter.get("/", async (req, res) => {
  try {
    const items = await listNotifications(req.query);
    res.json({ ok: true, items });
  } catch (error) {
    console.error(`[${req.requestId}]`, error);
    res.status(500).json({ ok: false, error: "server_error", requestId: req.requestId });
  }
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  try {
    const id = req.params.id;
    const read = req.body?.read !== false;
    const db = await ensureDb();
    const result = await db.collection("notifications").updateOne({ _id: id }, { $set: { read } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ ok: false, error: "not_found", requestId: req.requestId });
    }
    res.json({ ok: true, id, read });
  } catch (error) {
    console.error(`[${req.requestId}]`, error);
    res.status(500).json({ ok: false, error: "server_error", requestId: req.requestId });
  }
});