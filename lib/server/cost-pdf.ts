import { lineActual, lineEstimate, lineVariance } from "@/lib/boq";
import { formatMoney } from "@/lib/utils";

export interface PdfLine {
  code: string;
  description: string;
  unit: string;
  estimatedQty: number;
  actualQty: number;
  unitRate: number;
}

/** One-page landscape cost report. Built-in Helvetica, no extra font files. */
export function costReportPdf(input: {
  code: string;
  name: string;
  surveyor: string;
  lines: PdfLine[];
}) {
  const estimated = input.lines.reduce((sum, line) => sum + lineEstimate(line), 0);
  const actual = input.lines.reduce((sum, line) => sum + lineActual(line), 0);
  const commands: string[] = [];
  const paint = (x: number, y: number, size: number, text: string) => {
    commands.push(`BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdf(text.replace(/[^\x20-\x7E]/g, " "))}) Tj ET`);
  };
  paint(36, 560, 16, `${input.code} cost report`);
  paint(36, 540, 11, input.name);
  paint(36, 524, 10, input.surveyor);
  paint(36, 500, 9, "Item");
  paint(250, 500, 9, "Qty est / act");
  paint(390, 500, 9, "Rate");
  paint(500, 500, 9, "Estimated");
  paint(620, 500, 9, "Actual");
  paint(740, 500, 9, "Variance");
  input.lines.forEach((line, index) => {
    const y = 478 - index * 28;
    paint(36, y, 9, line.code);
    paint(36, y - 12, 8, clip(line.description, 36));
    paint(250, y, 9, `${line.estimatedQty} / ${line.actualQty} ${line.unit}`);
    paint(390, y, 9, formatMoney(line.unitRate));
    paint(500, y, 9, formatMoney(lineEstimate(line)));
    paint(620, y, 9, formatMoney(lineActual(line)));
    paint(740, y, 9, formatMoney(lineVariance(line)));
  });
  const totalY = 478 - input.lines.length * 28 - 8;
  paint(36, totalY, 10, "Measured total");
  paint(500, totalY, 10, formatMoney(estimated));
  paint(620, totalY, 10, formatMoney(actual));
  paint(740, totalY, 10, formatMoney(actual - estimated));
  paint(36, 28, 8, "Demonstration cost report for Vertexa Group. Not a live account.");
  return renderPdf(commands.join("\n"));
}

function clip(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function escapePdf(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function renderPdf(stream: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(body);
}
