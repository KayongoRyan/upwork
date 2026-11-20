import { config } from "../config.js";

const buckets = new Map();

function clientIp(req) {
  const forwarded = req.get("x-forwarded-for");
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/** Simple fixed-window limiter for public inquiry creation. */
export function rateLimitInquiry(req, res, next) {
  const { windowMs, max } = config.inquiryRateLimit;
  if (!Number.isFinite(max) || max <= 0) return next();

  const now = Date.now();
  const key = clientIp(req);
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, max - bucket.count);
  res.setHeader("RateLimit-Limit", String(max));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

  // Opportunistic cleanup of stale buckets.
  if (buckets.size > 5000) {
    for (const [entryKey, entry] of buckets) {
      if (now >= entry.resetAt) buckets.delete(entryKey);
    }
  }

  if (bucket.count > max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      ok: false,
      error: "rate_limited",
      retryAfter,
      requestId: req.requestId,
    });
  }

  next();
}
