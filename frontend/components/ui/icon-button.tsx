import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACCENT_FILL_LIGHT, ACCENT_FILL_MEDIUM } from "@/lib/colors";

type IconButtonProps = React.ComponentProps<typeof Button>;

export function IconButton({
  className,
  style,
  size = "icon",
  variant = "ghost",
  appearance = "default",
  children,
  ...rest
}: IconButtonProps & { appearance?: "default" | "inactive" }) {
  const mergedStyle: React.CSSProperties = {
    // Базовые цвета подложки по дизайн-токенам
    "--icon-button-bg": ACCENT_FILL_LIGHT,
    "--icon-button-bg-hover": ACCENT_FILL_MEDIUM,
    ...(style as React.CSSProperties),
  };

  return (
    <Button
      {...rest}
      variant={variant}
      size={size}
      className={cn(
        // 32x32 прямоугольник со скруглением 9px
        "h-8 w-8 shrink-0 rounded-[9px]",
        // Подложка и hover — только для активного варианта
        appearance === "inactive"
          ? null
          : "bg-[var(--icon-button-bg)] hover:bg-[var(--icon-button-bg-hover)]",
        // Цвет иконки по умолчанию
        "text-[rgba(197,191,241,0.6)]",
        // Иконка 16x16 по умолчанию, если не переопределена size- классом
        "[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      style={mergedStyle}
    >
      {children}
    </Button>
  );
}


