import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-accent text-white hover:bg-[#e64e18]",
        navy: "bg-black text-white hover:bg-black/80",
        outline: "border border-black/10 bg-white text-black shadow-none hover:bg-black/[0.03]",
        ghost: "text-black hover:bg-black/[0.04]",
        danger: "bg-black text-white hover:bg-black/80",
        subtle: "bg-black/[0.04] text-black hover:bg-black/[0.07]",
      },
      size: {
        default: "h-10 px-3.5",
        sm: "h-8 rounded-xl px-2.5 text-[13px]",
        lg: "h-11 px-4",
        icon: "size-10 rounded-2xl",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
