"use client";

import { PageHeader } from "@/components/shared/page-header";
import { ExtractInvoicePanel } from "@/components/documents/extract-invoice-panel";
import { useQuantitySurveyor } from "@/lib/data/admin-store";

export function QsDocuments() {
  const data = useQuantitySurveyor();
  const csrfToken = data.viewer?.csrfToken ?? "";

  return (
    <div>
      <PageHeader
        title="Document extraction"
        description="Upload an invoice or supporting document, review the extracted data, correct any fields, then explicitly accept it before using the values."
      />
      <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Extract invoice metadata</h2>
        <p className="mt-1 mb-4 text-sm text-black/55">Extraction is best-effort. Review every field, fix validation errors, and accept only when the data is correct.</p>
        <ExtractInvoicePanel csrfToken={csrfToken} />
      </section>
    </div>
  );
}
