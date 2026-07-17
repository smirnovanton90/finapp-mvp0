"use client";

import * as React from "react";
import type { FormEvent } from "react";
import { ChevronLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { MODAL_BG, ACTIVE_TEXT_DARK } from "@/lib/colors";
import { cn } from "@/lib/utils";

export type FormModalSize = "wide" | "medium";

export interface FormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  icon?: React.ReactNode;
  formError: string | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  submitLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  size?: FormModalSize;
  /** Optional ref forwarded to DialogContent (e.g. for dropdown positioning). */
  contentRef?: React.RefObject<HTMLDivElement | null>;
  /** Optional className for the inner grid container. */
  className?: string;
  /** Optional onCloseAutoFocus for DialogContent (e.g. refocus last active element). */
  onCloseAutoFocus?: (event: Event) => void;
  /** When false, Radix Dialog uses modal={false} (no focus trap / no inert). Use when opening this modal from another modal. */
  modal?: boolean;
  /** Класс для оверлея и контейнера (например z-[100] для вложенной модалки). */
  overlayClassName?: string;
  containerClassName?: string;
  /** На мобильной: "fullscreen" — отдельное полноэкранное окно с заголовком и "назад", не модалка. */
  variant?: "modal" | "fullscreen";
  children: React.ReactNode;
}

const sizeStyles: Record<FormModalSize, string> = {
  wide: "w-full sm:max-w-6xl",
  medium: "sm:max-w-[600px]",
};

const AUTH_PRIMARY_BUTTON_STYLE: React.CSSProperties = {
  "--auth-primary-bg":
    "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
  "--auth-primary-bg-hover":
    "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
} as React.CSSProperties;

const GLASS_BUTTON_STYLE: React.CSSProperties = {
  "--glass-bg": "rgba(108, 93, 215, 0.22)",
  "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
} as React.CSSProperties;

export function FormModal({
  open,
  onOpenChange,
  title,
  icon,
  formError,
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel = "Отмена",
  loading = false,
  disabled = false,
  size = "medium",
  contentRef,
  className,
  onCloseAutoFocus,
  modal = true,
  overlayClassName,
  containerClassName,
  variant = "modal",
  children,
}: FormModalProps) {
  const isFullscreen = variant === "fullscreen";

  if (isFullscreen) {
    if (!open) return null;
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col"
        style={{ backgroundColor: MODAL_BG }}
        aria-modal
        aria-label={title}
      >
        <header className="shrink-0 flex items-center gap-2 border-b border-sidebar-border px-3 py-2">
          <IconButton
            type="button"
            aria-label="Назад"
            onClick={onCancel}
            appearance="default"
          >
            <ChevronLeft className="size-5" strokeWidth={1.5} />
          </IconButton>
          <span className="flex-1 min-w-0 truncate text-sm font-medium" style={{ color: ACTIVE_TEXT_DARK }}>
            {title}
          </span>
          <Button
            type="submit"
            form={isFullscreen ? "form-modal-fullscreen-form" : undefined}
            variant="authPrimary"
            disabled={loading || disabled}
            className="rounded-lg border-0 text-sm shrink-0"
            style={AUTH_PRIMARY_BUTTON_STYLE}
          >
            {submitLabel}
          </Button>
        </header>
        <form
          id="form-modal-fullscreen-form"
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col flex-1 min-h-0 gap-4 text-sm overflow-hidden"
        >
          {formError && (
            <div
              className="shrink-0 text-xs rounded-md border p-2 mx-3 mt-2"
              style={{
                color: "#FB4C4F",
                backgroundColor: "rgba(251, 76, 79, 0.08)",
                borderColor: "rgba(251, 76, 79, 0.3)",
              }}
            >
              {formError}
            </div>
          )}
          <div
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-4 flex flex-col gap-4 [&_.text-sm]:text-xs [&_.text-base]:text-sm [&_.text-lg]:text-base [&_input]:text-sm [&_button]:text-sm"
            style={{
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
              paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            {children}
          </div>
        </form>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogContent
        ref={contentRef}
        onCloseAutoFocus={onCloseAutoFocus}
        overlayClassName={overlayClassName}
        containerClassName={cn("overflow-hidden", containerClassName)}
        className={cn(sizeStyles[size], "max-h-[90vh] flex flex-col gap-0 overflow-hidden p-6")}
        style={{ backgroundColor: MODAL_BG }}
      >
        <div className={cn("flex flex-col flex-1 min-h-0 gap-4", className)}>
          <DialogHeader className="shrink-0 gap-4">
            <DialogTitle
              className={cn(
                "flex items-center gap-3 text-[32px] font-medium",
                icon && "text-[32px]"
              )}
              style={{ color: ACTIVE_TEXT_DARK }}
            >
              {icon}
              {title}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} noValidate className="flex flex-col flex-1 min-h-0 gap-6">
            {formError && (
              <div
                className="shrink-0 text-sm rounded-md border p-3"
                style={{
                  color: "#FB4C4F",
                  backgroundColor: "rgba(251, 76, 79, 0.08)",
                  borderColor: "rgba(251, 76, 79, 0.3)",
                }}
              >
                {formError}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-2 flex flex-col gap-6">
              {children}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="glass"
                  className="rounded-lg border-0"
                  style={GLASS_BUTTON_STYLE}
                  onClick={onCancel}
                >
                  {cancelLabel}
                </Button>
                <Button
                  type="submit"
                  variant="authPrimary"
                  disabled={loading || disabled}
                  className="rounded-lg border-0"
                  style={AUTH_PRIMARY_BUTTON_STYLE}
                >
                  {submitLabel}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
