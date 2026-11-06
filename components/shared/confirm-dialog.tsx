"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  pendingLabel = "Working…",
  tone = "danger",
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  pendingLabel?: string;
  tone?: "danger" | "default";
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={body} className="sm:max-w-md">
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant={tone === "danger" ? "danger" : "default"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
        <span className="sr-only">{pendingLabel}</span>
      </DialogContent>
    </Dialog>
  );
}
