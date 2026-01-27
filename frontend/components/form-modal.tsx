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
  children: React.ReactNode;
}

const sizeStyles: Record<FormModalSize, string> = {
  wide: "max-h-[90vh] overflow-y-auto overflow-x-hidden max-w-[none] w-auto",
  medium: "sm:max-w-[560px] max-h-[90vh] overflow-y-auto",
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
  children,
}: FormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        onCloseAutoFocus={onCloseAutoFocus}
        className={cn(sizeStyles[size], "gap-4")}
        style={
          size === "wide"
            ? { backgroundColor: MODAL_BG, maxWidth: "none", width: "auto" }
            : { backgroundColor: MODAL_BG }
        }
      >
        <div className={cn("grid gap-4", className)}>
          <DialogHeader>
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

          <form onSubmit={onSubmit} noValidate className="grid gap-6">
            {formError && (
              <div
                className="text-sm rounded-md border p-3"
                style={{
                  color: "#FB4C4F",
                  backgroundColor: "rgba(251, 76, 79, 0.08)",
                  borderColor: "rgba(251, 76, 79, 0.3)",
                }}
              >
                {formError}
              </div>
            )}

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
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
