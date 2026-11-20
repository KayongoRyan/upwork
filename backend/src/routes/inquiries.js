import { Router } from "express";
import { createInquiry, getInquiry, listInquiries, updateInquiry } from "../services/inquiryService.js";

export const inquiriesRouter = Router();

inquiriesRouter.get("/", async (req, res) => {
  try {
    const items = await listInquiries(req.query);
    res.json({ items });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "server_error" });
  }
});

inquiriesRouter.post("/", async (req, res) => {
  try {
    const result = await createInquiry(req.body ?? {});
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }
    res.status(201).json({ ok: true, inquiry: result.inquiry });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

inquiriesRouter.get("/:id", async (req, res) => {
  try {
    const inquiry = await getInquiry(req.params.id);
    if (!inquiry) return res.status(404).json({ error: "not_found" });
    res.json({ inquiry });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "server_error" });
  }
});

inquiriesRouter.patch("/:id", async (req, res) => {
  try {
    const result = await updateInquiry(req.params.id, req.body ?? {});
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 400;
      return res.status(status).json({ ok: false, error: result.error });
    }
    res.json({ ok: true, inquiry: result.inquiry });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});