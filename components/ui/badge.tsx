import { cn } from "@/lib/utils";

const tones = {
  green: "bg-[#e7f6ee] text-[#17693b]",
  red: "bg-[#fdeceb] text-[#9d2b24]",
  amber: "bg-[#fff4dc] text-[#8a5b04]",
  navy: "bg-[#e7eef8] text-[#16365d]",
  slate: "bg-[#eef1f4] text-[#4d5b6b]",
  blue: "bg-[#e8f1fb] text-[#1d4e89]",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({
  tone = "slate",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
