"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { inquiryErrorMessage } from "@/lib/vertexa-inquiry";
import type { VertexaServiceId } from "@/lib/vertexa-projects";

type ServiceInquiryFormProps = {
  service: VertexaServiceId;
  className?: string;
};

type FormStatus = "idle" | "submitting" | "sent" | "error";

export function ServiceInquiryForm({ service, className }: ServiceInquiryFormProps) {
  const params = useSearchParams();
  const pathname = usePathname();

  const [status, setStatus] = useState<FormStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Same contract as the contact form: the route redirects with ?saved=1 or
  // ?error=<code>, and the message can also arrive via a full page load.
  useEffect(() => {
    const saved = params.get("saved") === "1";
    const errorParam = params.get("error");
    if (saved) {
      // Applying the redirect result after hydration keeps the server markup
      // and the first client render identical.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("sent");
      setError(null);
    } else if (errorParam) {
      setStatus("error");
      setError(inquiryErrorMessage(errorParam));
    }
  }, [params]);

  useEffect(() => {
    if (status === "sent" || status === "error") {
      try {
        window.history.replaceState(
          {},
          document.title,
          pathname.split("?")[0] + (status === "sent" ? "#received" : "")
        );
      } catch {}
    }
  }, [status, pathname]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("submitting");
    setError(null);

    const formData = new FormData(event.currentTarget as HTMLFormElement);
    formData.set("service", service);
    formData.set("returnTo", pathname);

    try {
      const response = await fetch("/api/vertexa/inquiries", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        setStatus("error");
        setError("Unable to send your message. Please try again.");
        return;
      }

      const url = new URL(response.url);
      const responseError = url.searchParams.get("error");
      const hash = url.hash;

      if (responseError) {
        setStatus("error");
        setError(inquiryErrorMessage(responseError));
        return;
      }

      setStatus("sent");
      try {
        window.history.replaceState({}, document.title, pathname + (hash || "#received"));
      } catch {}
    } catch {
      setStatus("error");
      setError("Unable to send your message. Please try again.");
    }
  };

  return (
    <form
      className={className ?? "vx-service-inquiry-form"}
      onSubmit={handleSubmit}
      noValidate
    >
      {status === "sent" ? (
        <div className="vx-inquiry-sent">
          <h3 className="vx-inquiry-sent-title">Message sent.</h3>
          <p className="vx-inquiry-sent-copy">
            Thank you for getting in touch. A project manager will review your enquiry and be in contact shortly.
          </p>
          <Link className="vx-inquiry-sent-link" href="/vertexa">
            Return home <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : (
        <>
          {status === "error" && error ? (
            <p className="vx-inquiry-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="vx-inquiry-field">
            <label htmlFor="inquiry-name">Full name</label>
            <input
              id="inquiry-name"
              name="name"
              type="text"
              required
              autoComplete="name"
              placeholder="e.g. Jean Pierre Habimana"
              defaultValue={status === "error" ? "" : undefined}
            />
          </div>

          <div className="vx-inquiry-field">
            <label htmlFor="inquiry-email">Email address</label>
            <input
              id="inquiry-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="e.g. jp.habimana@example.com"
              defaultValue={status === "error" ? "" : undefined}
            />
          </div>

          <div className="vx-inquiry-field vx-inquiry-field--textarea">
            <label htmlFor="inquiry-message">Message</label>
            <textarea
              id="inquiry-message"
              name="message"
              required
              rows={6}
              autoComplete="off"
              placeholder="Tell us about your project — timeline, budget range in RWF, and any ideas you have so far."
              defaultValue={status === "error" ? "" : undefined}
            />
          </div>

          {status === "submitting" ? (
            <p className="vx-inquiry-sending">Sending…</p>
          ) : null}

          <button
            type="submit"
            className="vx-inquiry-submit"
            disabled={status === "submitting"}
          >
            {status === "submitting" ? "Sending…" : "Send enquiry"}
            <span aria-hidden="true">↗</span>
          </button>
        </>
      )}
    </form>
  );
}
