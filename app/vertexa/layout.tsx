import { Poppins } from "next/font/google";
import "./vertexa.css";

const poppins = Poppins({
  variable: "--font-vertexa-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export default function VertexaLayout({ children }: { children: React.ReactNode }) {
  return <div className={poppins.variable}>{children}</div>;
}
