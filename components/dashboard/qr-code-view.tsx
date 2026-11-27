"use client";

import { PortalQrCodes } from "@/components/dashboard/portal-qr-codes";
import { PageHeader } from "@/components/shared/page-header";

export function QrCodeView() {
  return (
    <div>
      <PageHeader
        title="QR Code"
        description="Sign-up QR codes for administrators, project managers, site engineers, and quantity surveyors. Scan a code to open that portal's sign-up page, then verify by email OTP before entering."
      />
      <PortalQrCodes />
    </div>
  );
}
