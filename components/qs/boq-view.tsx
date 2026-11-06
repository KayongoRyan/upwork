"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { boqUnits, lineActual, lineEstimate, lineVariance } from "@/lib/boq";
import { useQuantitySurveyor } from "@/lib/data/admin-store";
import { cn, formatMoney } from "@/lib/utils";
import type { BoqItem } from "@/types";

const field = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

export function QsBoq() {
  const data = useQuantitySurveyor();
  const project = data.project;

  return (
    <div>
      <PageHeader
        title="Bill of quantities"
        description={project ? `${project.code} · ${project.name}. Estimated amount and measured amount are quantity × unit rate, rounded to the franc.` : "No project is assigned to this account."}
      />
      {project ? <AddLine projectId={project.id} onAdd={data.add} /> : null}
      <div className="mt-4 overflow-x-auto rounded-[22px] border border-black/5 bg-card">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs text-black/40">
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-2 py-3 font-medium">Estimated qty</th>
              <th className="px-2 py-3 font-medium">Actual qty</th>
              <th className="px-2 py-3 font-medium">Unit rate</th>
              <th className="px-2 py-3 font-medium">Estimated</th>
              <th className="px-2 py-3 font-medium">Actual</th>
              <th className="px-2 py-3 font-medium">Variance</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {data.lines.map((item) => (
              <LineRow key={`${item.id}-${item.estimatedQty}-${item.actualQty}-${item.unitRate}`} item={item} onSave={data.save} onRemove={data.remove} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-black/5 text-sm font-semibold">
              <td className="px-4 py-3" colSpan={4}>Bill total</td>
              <td className="px-2 py-3 tabular-nums">{formatMoney(data.estimated)}</td>
              <td className="px-2 py-3 tabular-nums">{formatMoney(data.expenditure)}</td>
              <td className="px-2 py-3 tabular-nums">{formatMoney(data.expenditure - data.estimated)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function AddLine({ projectId, onAdd }: { projectId: string; onAdd: (input: Omit<BoqItem, "id">) => { ok: true } | { ok: false; error: string } }) {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState<string>(boqUnits[0]);
  const [estimatedQty, setEstimatedQty] = useState("0");
  const [actualQty, setActualQty] = useState("0");
  const [unitRate, setUnitRate] = useState("0");

  return (
    <form
      className="grid gap-3 rounded-[22px] border border-black/5 bg-card p-4 sm:grid-cols-2 lg:grid-cols-6"
      onSubmit={(event) => {
        event.preventDefault();
        const result = onAdd({
          projectId,
          code,
          description,
          unit,
          estimatedQty: Number(estimatedQty),
          actualQty: Number(actualQty),
          unitRate: Number(unitRate),
        });
        if (!result.ok) toast.error(result.error);
        else {
          toast.success("Line added. Project expenditure now includes it.");
          setCode("");
          setDescription("");
          setEstimatedQty("0");
          setActualQty("0");
          setUnitRate("0");
        }
      }}
    >
      <Label>Code<Input className="mt-1" value={code} onChange={(event) => setCode(event.target.value)} required /></Label>
      <Label className="lg:col-span-2">Description<Input className="mt-1" value={description} onChange={(event) => setDescription(event.target.value)} required /></Label>
      <Label>
        Unit
        <select className={`mt-1 ${field}`} value={unit} onChange={(event) => setUnit(event.target.value)}>
          {boqUnits.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </Label>
      <Label>Estimated qty<Input className="mt-1" type="number" min={0} step="0.001" value={estimatedQty} onChange={(event) => setEstimatedQty(event.target.value)} required /></Label>
      <Label>Actual qty<Input className="mt-1" type="number" min={0} step="0.001" value={actualQty} onChange={(event) => setActualQty(event.target.value)} required /></Label>
      <Label className="lg:col-span-2">Unit rate (RWF)<Input className="mt-1" type="number" min={0} step="1" value={unitRate} onChange={(event) => setUnitRate(event.target.value)} required /></Label>
      <div className="flex items-end">
        <Button type="submit">Add line</Button>
      </div>
    </form>
  );
}

function LineRow({
  item,
  onSave,
  onRemove,
}: {
  item: BoqItem;
  onSave: (id: string, input: Omit<BoqItem, "id">) => { ok: true } | { ok: false; error: string };
  onRemove: (id: string) => { ok: true } | { ok: false; error: string };
}) {
  const [estimatedQty, setEstimatedQty] = useState(String(item.estimatedQty));
  const [actualQty, setActualQty] = useState(String(item.actualQty));
  const [unitRate, setUnitRate] = useState(String(item.unitRate));
  const draft = {
    ...item,
    estimatedQty: Number(estimatedQty),
    actualQty: Number(actualQty),
    unitRate: Number(unitRate),
  };
  const gap = lineVariance(draft);

  return (
    <tr className="border-t border-black/5 align-top">
      <td className="px-4 py-3">
        <p className="font-medium">{item.code}</p>
        <p className="text-xs text-black/45">{item.description}</p>
        <p className="text-xs text-black/45">{item.unit}</p>
      </td>
      <td className="px-2 py-3"><Input type="number" min={0} step="0.001" value={estimatedQty} onChange={(event) => setEstimatedQty(event.target.value)} /></td>
      <td className="px-2 py-3"><Input type="number" min={0} step="0.001" value={actualQty} onChange={(event) => setActualQty(event.target.value)} /></td>
      <td className="px-2 py-3"><Input type="number" min={0} step="1" value={unitRate} onChange={(event) => setUnitRate(event.target.value)} /></td>
      <td className="px-2 py-3 tabular-nums">{formatMoney(lineEstimate(draft))}</td>
      <td className="px-2 py-3 tabular-nums">{formatMoney(lineActual(draft))}</td>
      <td className={cn("px-2 py-3 tabular-nums", gap > 0 && "text-accent")}>{formatMoney(gap)}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="navy"
            onClick={() => {
              const result = onSave(item.id, draft);
              if (!result.ok) toast.error(result.error);
              else toast.success("Saved. Project expenditure was recalculated.");
            }}
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const result = onRemove(item.id);
              if (!result.ok) toast.error(result.error);
              else toast.success("Line removed. Project expenditure was recalculated.");
            }}
          >
            Remove
          </Button>
        </div>
      </td>
    </tr>
  );
}
