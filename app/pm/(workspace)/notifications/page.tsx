import type { Metadata } from "next";
import { PmInbox } from "@/components/pm/inbox-view";

export const metadata: Metadata = { title: "Inbox" };

export default function Page() {
  return <PmInbox />;
}
