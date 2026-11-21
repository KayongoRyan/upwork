import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import { DocumentListeners } from "@/components/document-listeners";
import { PortalPortsProvider } from "@/components/portal-ports";
import { SearchQueryProvider } from "@/components/search/search-query";
import { AdminProvider } from "@/lib/data/admin-store";
import { getSessionUser } from "@/lib/server/auth";
import { portalByPort, readBoundPorts, type CpmisPortalId } from "@/lib/portals";
import { readState } from "@/lib/server/portal-store";
import { listVertexaNotifications } from "@/lib/server/vertexa-api";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CPMIS Administrator",
    template: "%s · CPMIS",
  },
  description: "Construction Project Management Information System — administrator preview.",
};

function requestPortal(headers: Headers): CpmisPortalId {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "";
  const match = host.match(/:(\d+)$/);
  const port = match ? Number(match[1]) : headers.get("x-forwarded-proto") === "https" ? 443 : 80;
  const portal = portalByPort(port);
  // The public site shares this layout but has no portal workspace of its own.
  return portal && portal.id !== "vertexa" ? portal.id : "administrator";
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const requestHeaders = await headers();
  const portal = requestPortal(requestHeaders);
  const [initialState, notificationsResult, session] = await Promise.all([
    readState(),
    listVertexaNotifications(),
    getSessionUser(portal),
  ]);
  const { items: initialNotifications } = notificationsResult;
  const query = requestHeaders.get("x-cpmis-q") ?? "";
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <DocumentListeners />
        <SearchQueryProvider query={query}>
          <PortalPortsProvider ports={readBoundPorts()}>
            <AdminProvider portal={portal} initialState={initialState} initialNotifications={initialNotifications} session={session}>
              {children}
            </AdminProvider>
          </PortalPortsProvider>
        </SearchQueryProvider>
      </body>
    </html>
  );
}
