"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

type TooltipSide = "top" | "right" | "bottom" | "left" | "top-right"

type TooltipProps = {
  content: React.ReactNode
  side?: TooltipSide
  className?: string
  contentClassName?: string
  children: React.ReactNode
}

const sideTransforms: Record<TooltipSide, string> = {
  top: "-translate-x-1/2 -translate-y-[calc(100%+0.5rem)]",
  right: "translate-x-2 -translate-y-1/2",
  bottom: "-translate-x-1/2 translate-y-2",
  left: "-translate-x-[calc(100%+0.5rem)] -translate-y-1/2",
  "top-right": "translate-x-2 -translate-y-[calc(100%+0.5rem)]",
}

function Tooltip({
  content,
  side = "top-right",
  className,
  contentClassName,
  children,
}: TooltipProps) {
  const triggerRef = React.useRef<HTMLSpanElement>(null)
  const [mounted, setMounted] = React.useState(false)
  const [isOpen, setIsOpen] = React.useState(false)
  const [coords, setCoords] = React.useState({ x: 0, y: 0 })

  const updateFromTrigger = React.useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }

    switch (side) {
      case "top":
        setCoords({ x: rect.left + rect.width / 2, y: rect.top })
        return
      case "right":
        setCoords({ x: rect.right, y: rect.top + rect.height / 2 })
        return
      case "bottom":
        setCoords({ x: rect.left + rect.width / 2, y: rect.bottom })
        return
      case "left":
        setCoords({ x: rect.left, y: rect.top + rect.height / 2 })
        return
      case "top-right":
      default:
        setCoords({ x: rect.right, y: rect.top })
    }
  }, [side])

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePositionUpdate = () => {
      updateFromTrigger()
    }

    handlePositionUpdate()
    window.addEventListener("scroll", handlePositionUpdate, true)
    window.addEventListener("resize", handlePositionUpdate)

    return () => {
      window.removeEventListener("scroll", handlePositionUpdate, true)
      window.removeEventListener("resize", handlePositionUpdate)
    }
  }, [isOpen, updateFromTrigger])

  const handleMouseEnter = () => {
    updateFromTrigger()
    setIsOpen(true)
  }

  const handleMouseLeave = () => {
    setIsOpen(false)
  }

  const handleFocus = () => {
    updateFromTrigger()
    setIsOpen(true)
  }

  const handleBlur = () => {
    setIsOpen(false)
  }

  return (
    <span
      ref={triggerRef}
      className={cn("relative inline-flex", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children}
      {mounted &&
        isOpen &&
        createPortal(
          <span
            role="tooltip"
            className={cn(
              "pointer-events-none fixed z-[70] w-max max-w-[320px] rounded-md border border-border/70 bg-white px-3 py-2 text-xs leading-snug text-muted-foreground shadow-lg",
              "whitespace-normal break-words text-left",
              sideTransforms[side],
              contentClassName
            )}
            style={{ left: coords.x, top: coords.y }}
          >
            {content}
          </span>,
          document.body
        )}
    </span>
  )
}

export { Tooltip }
