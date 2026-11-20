"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { inquiryErrorMessage, vertexaInquiryServices } from "@/lib/vertexa-inquiry";

type FormStatus = "idle" | "submitting" | "sent" | "error";

export function ContactForm() {
  const params = useSearchParams();
  const pathname = usePathname();
  const formTitleId = useId();

  const [status, setStatus] = useState<FormStatus>("idle");
  const [error, setError] = useState<string | null>(null);

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
    if (status !== "sent" && status !== "error") return;
    try {
      const cleanPath = pathname.split("?")[0];
      window.history.replaceState(
        {},
        document.title,
        cleanPath + (status === "sent" ? "#received" : "")
      );
    } catch {
      /* ignore */
    }
  }, [status, pathname]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form.reportValidity()) {
      setStatus("error");
      setError("Please complete the required fields.");
      return;
    }

    setStatus("submitting");
    setError(null);

    const formData = new FormData(form);
    formData.set("scope", "project-inquiry");
    formData.set("returnTo", pathname);

    try {
      const response = await fetch("/api/vertexa/inquiries", {
        method: "POST",
        body: formData,
        redirect: "follow",
      });

      if (!response.ok) {
        setStatus("error");
        setError("Unable to send your inquiry. Please try again.");
        return;
      }

      const url = new URL(response.url);
      const responseError = url.searchParams.get("error");

      if (responseError) {
        setStatus("error");
        setError(inquiryErrorMessage(responseError));
        return;
      }

      setStatus("sent");
      form.reset();
    } catch {
      setStatus("error");
      setError("Unable to send your inquiry. Please check your connection and try again.");
    }
  };

  if (status === "sent") {
    return (
      <div className="vx-contact-sent" id="received">
        <h3 className="vx-contact-sent-title">Inquiry received.</h3>
        <p className="vx-contact-sent-copy">
          Thank you for reaching out. A project manager will review your brief and respond within one
          business day.
        </p>
        <Link className="vx-contact-sent-link" href="/vertexa">
          Return home <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  }

  return (
    <form
      className="vx-contact-form vx-contact-form--inquiry"
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby={formTitleId}
    >
      <h2 id={formTitleId} className="vx-contact-form-title">
        Project inquiry
      </h2>
      <p className="vx-contact-form-lead">
        Share a few details about your build and we&apos;ll follow up with next steps.
      </p>

      {status === "error" && error ? (
        <p className="vx-contact-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="vx-contact-field">
        <label htmlFor="contact-service">Project type</label>
        <select id="contact-service" name="service" required defaultValue="custom-homes">
          {vertexaInquiryServices.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="vx-contact-field-row">
        <div className="vx-contact-field">
          <label htmlFor="contact-name">Full name</label>
          <input
            id="contact-name"
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            placeholder="e.g. Claudine Uwase"
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
            placeholder="e.g. claudine@example.com"
          />
        </div>
      </div>

      <div className="vx-contact-field-row">
        <div className="vx-contact-field">
          <label htmlFor="contact-phone">Phone</label>
          <input
            id="contact-phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            placeholder="e.g. 0788 123 456"
            pattern="[\d\s()+\-./]{6,30}"
            title="6–30 characters: digits, spaces, and + ( ) - ."
          />
        </div>
        <div className="vx-contact-field">
          <label htmlFor="contact-location">Project location</label>
          <input
            id="contact-location"
            name="location"
            type="text"
            required
            minLength={2}
            maxLength={120}
            autoComplete="address-level2"
            placeholder="e.g. Nyarutarama, Kigali"
          />
        </div>
      </div>

      <div className="vx-contact-field-row">
        <div className="vx-contact-field vx-contact-field--optional">
          <label htmlFor="contact-budget">
            Budget range <span className="vx-contact-optional">(optional, RWF)</span>
          </label>
          <input
            id="contact-budget"
            name="budget"
            type="text"
            maxLength={80}
            autoComplete="off"
            placeholder="e.g. RWF 250M – 350M"
          />
        </div>
        <div className="vx-contact-field vx-contact-field--optional">
          <label htmlFor="contact-start">
            Expected start <span className="vx-contact-optional">(optional)</span>
          </label>
          <input id="contact-start" name="startDate" type="date" autoComplete="off" />
        </div>
      </div>

      <div className="vx-contact-field vx-contact-field--textarea">
        <label htmlFor="contact-message">Project description</label>
        <textarea
          id="contact-message"
          name="message"
          required
          minLength={10}
          maxLength={2000}
          rows={7}
          autoComplete="off"
          placeholder="Tell us about the site, brief, timeline, and anything that will help us prepare."
        />
      </div>

      {status === "submitting" ? (
        <p className="vx-contact-sending" aria-live="polite">
          Sending your inquiry…
        </p>
      ) : null}

      <button
        type="submit"
        className="vx-contact-submit"
        disabled={status === "submitting"}
        aria-busy={status === "submitting"}
      >
        {status === "submitting" ? "Sending…" : "Submit inquiry"}
        <span aria-hidden="true">↗</span>
      </button>
    </form>
  );
}