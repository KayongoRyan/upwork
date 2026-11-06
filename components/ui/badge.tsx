import { cn } from "@/lib/utils";

const tones = {
  green: "bg-black text-white",
  red: "bg-accent text-white",
  amber: "bg-[#fff1eb] text-black",
  navy: "bg-black text-white",
  slate: "bg-black/[0.06] text-black/70",
  blue: "bg-[#fff1eb] text-black",
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
