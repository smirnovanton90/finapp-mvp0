import { GREEN, GREEN_FILL, RED, RED_FILL } from "@/lib/colors";
import { cn } from "@/lib/utils";

type TagVariant = "good" | "bad";

interface TagProps {
  children: React.ReactNode;
  variant: TagVariant;
  className?: string;
}

export function Tag({ children, variant, className }: TagProps) {
  const isGood = variant === "good";
  const borderColor = isGood ? GREEN : RED;
  const fillColor = isGood ? GREEN_FILL : RED_FILL;
  const textColor = isGood ? GREEN : RED;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-medium tabular-nums",
        className
      )}
      style={{
        borderColor,
        backgroundColor: fillColor,
        color: textColor,
      }}
    >
      {children}
    </span>
  );
}
