import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import { PortalPortsProvider } from "@/components/portal-ports";
import { SearchQueryProvider } from "@/components/search/search-query";
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
  const query = (await headers()).get("x-cpmis-q") ?? "";
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <script
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener("change",function(e){var t=e.target;if(!t||!t.getAttribute)return;if(t.form&&t.form.hasAttribute("data-report-form")){var q=new URLSearchParams();new FormData(t.form).forEach(function(v,k){if(typeof v!=="string"||v===""||(k==="project"&&v==="all"))return;q.set(k,v)});var s=q.toString();location.assign(t.form.getAttribute("action")+(s?"?"+s:""));return}var base=t.getAttribute("data-status-go");if(!base)return;var v=t.value;location.assign(v==="all"?base:base+"?status="+encodeURIComponent(v)+"#activities")});document.addEventListener("DOMContentLoaded",function(){var node=document.querySelector("[data-scroll-today]");if(node)node.scrollLeft=Number(node.getAttribute("data-scroll-today"))||0});`,
          }}
        />
        <SearchQueryProvider query={query}>
          <PortalPortsProvider ports={readBoundPorts()}>
            <AdminProvider initialState={initialState}>{children}</AdminProvider>
          </PortalPortsProvider>
        </SearchQueryProvider>
      </body>
    </html>
  );
}
