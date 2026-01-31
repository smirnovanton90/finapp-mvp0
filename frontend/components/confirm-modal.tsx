"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MODAL_BG, ACTIVE_TEXT_DARK, PLACEHOLDER_COLOR_DARK, RED } from "@/lib/colors";
import { Trash2 } from "lucide-react";

export interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  /** "destructive" — красная кнопка (удаление), "primary" — фиолетовая (подтверждение) */
  variant?: "destructive" | "primary";
  /** Иконка слева от заголовка; по умолчанию Trash2 для destructive */
  icon?: React.ReactNode;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  loading = false,
  variant = "destructive",
  icon,
}: ConfirmModalProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const busy = loading || isSubmitting;

  const defaultIcon =
    variant === "destructive" ? (
      <Trash2 className="w-8 h-8 shrink-0" style={{ color: RED }} />
    ) : null;
  const titleIcon = icon !== undefined ? icon : defaultIcon;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[600px] gap-4"
        style={{ backgroundColor: MODAL_BG }}
      >
        <div className="grid gap-4">
          <DialogHeader>
            <DialogTitle
              className="flex items-center gap-3 text-[32px] font-medium"
              style={{ color: ACTIVE_TEXT_DARK }}
            >
              {titleIcon}
              {title}
            </DialogTitle>
          </DialogHeader>
          <div
            className="text-sm"
            style={{ color: PLACEHOLDER_COLOR_DARK }}
          >
            {description}
          </div>
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
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={variant === "primary" ? "authPrimary" : undefined}
              className={
                variant === "destructive"
                  ? "rounded-lg border-0 bg-rose-600 text-white hover:bg-rose-700"
                  : "rounded-lg border-0"
              }
              style={
                variant === "primary"
                  ? ({
                      "--auth-primary-bg":
                        "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                      "--auth-primary-bg-hover":
                        "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                    } as React.CSSProperties)
                  : undefined
              }
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? "..." : confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
