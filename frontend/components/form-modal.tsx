"use client";

import * as React from "react";
import type { FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  children: React.ReactNode;
}

const sizeStyles: Record<FormModalSize, string> = {
  wide: "w-full sm:max-w-6xl",
  medium: "sm:max-w-[600px]",
};

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
  children,
}: FormModalProps) {
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

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pr-1 flex flex-col gap-6">
              {children}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="glass"
                  className="rounded-lg border-0"
                  style={
                    {
                      "--glass-bg": "rgba(108, 93, 215, 0.22)",
                      "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                    } as React.CSSProperties
                  }
                  onClick={onCancel}
                >
                  {cancelLabel}
                </Button>
                <Button
                  type="submit"
                  variant="authPrimary"
                  disabled={loading || disabled}
                  className="rounded-lg border-0"
                  style={
                    {
                      "--auth-primary-bg":
                        "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                      "--auth-primary-bg-hover":
                        "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                    } as React.CSSProperties
                  }
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
