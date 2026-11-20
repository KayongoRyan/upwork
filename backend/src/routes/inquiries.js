import { Router } from "express";
import { createInquiry, listInquiries } from "../services/inquiryService.js";

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