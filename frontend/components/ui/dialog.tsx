"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { IconButton } from "@/components/ui/icon-button"
import { SelectorDropdownPortalProvider } from "@/components/selector-dropdown-portal-context"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean;
    overlayClassName?: string;
    /** Класс для контейнера (fixed inset-0). Например z-[100] для вложенной модалки. */
    containerClassName?: string;
    /** Заголовок для скринридеров (обязателен для доступности). Скрыт визуально. */
    title?: string;
  }
>(({ className, children, showCloseButton = true, overlayClassName, containerClassName, title = "Диалог", onPointerDownOutside, onInteractOutside, ...props }, ref) => {
  const selectorPortalRef = React.useRef<HTMLDivElement>(null);
  const handlePointerDownOutside = (e: Event) => {
    if ((e.target as HTMLElement).closest?.("[data-selector-dropdown]")) {
      e.preventDefault();
    }
    onPointerDownOutside?.(e as never);
  };
  const handleInteractOutside = (e: Event) => {
    if ((e.target as HTMLElement).closest?.("[data-selector-dropdown]")) {
      e.preventDefault();
    }
    onInteractOutside?.(e as never);
  };
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} />
      <div className={cn("fixed inset-0 z-50 overflow-y-auto overflow-x-hidden overscroll-contain", containerClassName)}>
        <div className="min-h-full flex flex-col items-center py-6">
          <DialogPrimitive.Content
            ref={ref}
            data-slot="dialog-content"
            aria-describedby={undefined}
            className={cn(
              "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 relative w-full max-w-[calc(100%-2rem)] sm:max-w-lg mx-auto my-auto grid gap-4 rounded-lg p-6 shadow-lg duration-200 outline-none overflow-visible overscroll-contain",
              className
            )}
            {...props}
            onPointerDownOutside={handlePointerDownOutside}
            onInteractOutside={handleInteractOutside}
          >
            <SelectorDropdownPortalProvider value={selectorPortalRef}>
              <DialogPrimitive.Title className="sr-only">
                {title}
              </DialogPrimitive.Title>
              {children}
              <div ref={selectorPortalRef} className="relative" aria-hidden />
              {showCloseButton && (
                <DialogPrimitive.Close
                  data-slot="dialog-close"
                  asChild
                >
                  <IconButton
                    className="absolute top-4 right-4"
                    aria-label="Закрыть модальное окно"
                  >
                    <XIcon />
                  </IconButton>
                </DialogPrimitive.Close>
              )}
            </SelectorDropdownPortalProvider>
          </DialogPrimitive.Content>
        </div>
      </div>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
