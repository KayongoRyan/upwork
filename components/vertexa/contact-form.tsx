"use client";

import { useState } from "react";
import Link from "next/link";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setTimeout(() => setStatus("sent"), 1200);
  };

  return (
    <form className="vx-contact-form" onSubmit={handleSubmit} noValidate>
      {status === "sent" ? (
        <div className="vx-contact-sent">
          <h3 className="vx-contact-sent-title">Message sent.</h3>
          <p className="vx-contact-sent-copy">
            Thank you — we’ll be in touch shortly.
          </p>
          <Link
            className="vx-contact-sent-link"
            href="/vertexa"
          >
            Return home <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : (
        <>
          <div className="vx-contact-field">
            <label htmlFor="contact-name">Full name</label>
            <input
              id="contact-name"
              name="name"
              type="text"
              required
              autoComplete="name"
              placeholder="e.g. Alex Morgan"
            />
          </div>

          <div className="vx-contact-field">
            <label htmlFor="contact-email">Email address</label>
            <input
              id="contact-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="e.g. alex@example.com"
            />
          </div>

          <div className="vx-contact-field">
            <label htmlFor="contact-service">Project type</label>
            <select id="contact-service" name="service">
              <option value="custom-home">Custom home construction</option>
              <option value="renovation">Home renovation</option>
              <option value="extension">Home extension</option>
              <option value="other">General enquiry</option>
            </select>
          </div>

          <div className="vx-contact-field vx-contact-field--textarea">
            <label htmlFor="contact-message">Message</label>
            <textarea
              id="contact-message"
              name="message"
              required
              rows={6}
              autoComplete="off"
              placeholder="Tell us about your project..."
            />
          </div>

          {status === "sending" ? (
            <p className="vx-contact-sending">Sending…</p>
          ) : null}

          <button
            type="submit"
            className="vx-contact-submit"
            disabled={status === "sending"}
          >
            {status === "sending" ? "Sending…" : "Send message"}
            <span aria-hidden="true">↗</span>
          </button>
        </>
      )}
    </form>
  );
}
