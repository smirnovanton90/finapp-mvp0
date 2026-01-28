"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"
import { ACCENT, ACCENT_FILL_LIGHT, ACCENT_FILL_MEDIUM } from "@/lib/colors"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, style, ...props }, ref) => {
  const mergedStyle = {
    // Обводка трека — как у полей (ACCENT_FILL_MEDIUM)
    "--switch-track-border": ACCENT_FILL_MEDIUM,
    // Заливка трека во включенном состоянии
    "--switch-track-bg-on": ACCENT_FILL_LIGHT,
    // Заливка «движка» в выключенном состоянии
    "--switch-thumb-off": ACCENT_FILL_MEDIUM,
    // Заливка «движка» во включенном состоянии
    "--switch-thumb-on": ACCENT,
    ...(style as React.CSSProperties),
  } as React.CSSProperties

  return (
    <SwitchPrimitives.Root
      ref={ref}
      style={mergedStyle}
      className={cn(
        // Размер и форма трека
        "peer relative flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full",
        // Обводка как у инпутов, без утолщения снизу
        "border bg-transparent border-[color:var(--switch-track-border)]",
        // Состояния трека
        "transition-colors data-[state=checked]:bg-[color:var(--switch-track-bg-on)] data-[state=unchecked]:bg-transparent",
        // Фокус и disabled
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          // Размер и форма «движка»
          "pointer-events-none absolute h-5 w-5 rounded-full",
          // Вертикальное центрирование
          "top-1/2 -translate-y-1/2",
          // Цвет «движка» по состояниям
          "bg-[color:var(--switch-thumb-off)] data-[state=checked]:bg-[color:var(--switch-thumb-on)]",
          // Горизонтальные отступы от обводки — одинаковые и концентричные в обоих состояниях
          "data-[state=unchecked]:left-[2px] data-[state=checked]:right-[2px]",
          // Анимация перемещения и цвета
          "shadow-sm ring-0 transition-all"
        )}
      />
    </SwitchPrimitives.Root>
  )
})

Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
