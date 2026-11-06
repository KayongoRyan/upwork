import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import { PortalPortsProvider } from "@/components/portal-ports";
import { AdminProvider } from "@/lib/data/admin-store";
import { readBoundPorts } from "@/lib/portals";
import { readState } from "@/lib/server/memory";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const initialState = readState();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <PortalPortsProvider ports={readBoundPorts()}>
          <AdminProvider initialState={initialState}>{children}</AdminProvider>
        </PortalPortsProvider>
      </body>
    </html>
  );
}
