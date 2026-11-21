import type { Metadata } from "next";
import { PersonRecord } from "@/components/records/person-record";

export const metadata: Metadata = { title: "User" };

export default function Page() {
  return <PersonRecord kind="user" />;
}
