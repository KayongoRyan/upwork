import { Poppins } from "next/font/google";
import "./vertexa.css";

const poppins = Poppins({
  variable: "--font-vertexa-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export default function VertexaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={poppins.variable}>
      {children}
      <noscript>
        <style>{`.vx-reveal-word__inner{transform:none!important;opacity:1!important}`}</style>
      </noscript>
    </div>
  );
}
