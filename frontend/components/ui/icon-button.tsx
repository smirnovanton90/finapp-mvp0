"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { MobileTapScale } from "@/components/mobile-tap-scale";
import { useSidebar } from "@/components/ui/sidebar-context";
import { cn } from "@/lib/utils";

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
  const { isDesktop } = useSidebar();
  const button = (
    <Button
      {...rest}
      variant={variant}
      size={size}
      className={cn(
        // 32x32 прямоугольник со скруглением 9px
        "h-8 w-8 shrink-0 rounded-[9px]",
        // Подложка и hover как у полей ввода: при ховере светлее (input/30 → input/50 в dark, прозрачный → input/20 в light)
        appearance === "inactive"
          ? null
          : "bg-transparent shadow-xs hover:bg-input/20 dark:bg-input/30 dark:hover:bg-input/50",
        // Цвет иконки по умолчанию
        "text-[rgba(197,191,241,0.6)]",
        // Иконка 16x16 по умолчанию, если не переопределена size- классом
        "[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      style={style}
    >
      {children}
    </Button>
  );
  if (isDesktop) return button;
  return <MobileTapScale>{button}</MobileTapScale>;
}


