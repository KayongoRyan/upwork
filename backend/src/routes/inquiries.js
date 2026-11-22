import { Router } from "express";
import { config } from "../config.js";
import { rateLimitInquiry } from "../middleware/rateLimitInquiry.js";
import { requireAdminAuth } from "../middleware/requireAdminAuth.js";
import { createInquiry, getInquiry, listInquiries, updateInquiry } from "../services/inquiryService.js";

export const inquiriesRouter = Router();

inquiriesRouter.get("/", requireAdminAuth, async (req, res) => {
  try {
    const items = await listInquiries(req.query);
    res.json({ ok: true, items });
  } catch (error) {
    console.error(`[${req.requestId}]`, error);
    res.status(500).json({ ok: false, error: "server_error", requestId: req.requestId, apiVersion: config.apiVersion });
  }
});

/** Public site submission. Validated and rate-limited; does not require admin auth. */
inquiriesRouter.post("/", rateLimitInquiry, async (req, res) => {
  try {
    const result = await createInquiry(req.body ?? {});
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error, requestId: req.requestId, apiVersion: config.apiVersion });
    }
    res.status(201).json({ ok: true, inquiry: result.inquiry });
  } catch (error) {
    console.error(`[${req.requestId}]`, error);
    res.status(500).json({ ok: false, error: "server_error", requestId: req.requestId, apiVersion: config.apiVersion });
  }
});

inquiriesRouter.get("/:id", requireAdminAuth, async (req, res) => {
  try {
    const inquiry = await getInquiry(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ ok: false, error: "not_found", requestId: req.requestId, apiVersion: config.apiVersion });
    }
    res.json({ ok: true, inquiry });
  } catch (error) {
    console.error(`[${req.requestId}]`, error);
    res.status(500).json({ ok: false, error: "server_error", requestId: req.requestId, apiVersion: config.apiVersion });
  }
});

inquiriesRouter.patch("/:id", requireAdminAuth, async (req, res) => {
  try {
    const result = await updateInquiry(req.params.id, req.body ?? {});
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return res.status(status).json({ ok: false, error: result.error, requestId: req.requestId, apiVersion: config.apiVersion });
    }
    res.json({ ok: true, inquiry: result.inquiry });
  } catch (error) {
    console.error(`[${req.requestId}]`, error);
    res.status(500).json({ ok: false, error: "server_error", requestId: req.requestId, apiVersion: config.apiVersion });
  }
});