"use client";

import React, { useState, useCallback } from "react";
import { useSidebar } from "@/components/ui/sidebar-context";
import { cn } from "@/lib/utils";
const PRESS_SCALE = 0.97;
const TRANSITION_MS = 80;

/**
 * Обёртка для кнопок/элементов: на мобильной при нажатии слегка уменьшает масштаб (scale),
 * чтобы интерфейс ощущался отзывчивым. На десктопе рендерит children без изменений.
 */
export function MobileTapScale({
  children,
  className,
  style,
  as: Component = "div",
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Элемент-обёртка (по умолчанию div). */
  as?: "div" | "span";
}) {
  const { isDesktop } = useSidebar();
  const [pressed, setPressed] = useState(false);

  const onPointerDown = useCallback(() => {
    if (!isDesktop) setPressed(true);
  }, [isDesktop]);

  const onPointerUp = useCallback(() => setPressed(false), []);
  const onPointerLeave = useCallback(() => setPressed(false), []);
  const onPointerCancel = useCallback(() => setPressed(false), []);

  if (isDesktop) {
    return <>{children}</>;
  }

  const El = Component;
  return (
    <El
      className={cn("inline-block", className)}
      style={{
        ...style,
        transform: pressed ? `scale(${PRESS_SCALE})` : "scale(1)",
        transition: `transform ${TRANSITION_MS}ms ease-out`,
        touchAction: "manipulation",
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
    >
      {children}
    </El>
  );
}
