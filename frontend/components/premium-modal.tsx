"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface PremiumModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PremiumModal({ open, onOpenChange }: PremiumModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[719px] h-[539px] p-0 overflow-hidden border-0 shadow-[32px_33px_57.4px_-7px_rgba(27,16,48,0.81)] rounded-[20px] max-w-none sm:max-w-[719px]"
      >
        <DialogTitle className="sr-only">Premium</DialogTitle>
        <div
          className={cn(
            "relative w-full h-full flex flex-col justify-end rounded-[20px] overflow-hidden"
          )}
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(85, 68, 209, 0.9) 88.94%), url(/bd43aed1425680c9db0527fbe22edf87.jpg)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          {/* Группа с текстом и кнопкой */}
          <div className="relative z-10 flex flex-col items-start gap-4 pl-[61px] pr-[121px] pb-[47px]">
            {/* Текст */}
            <p
              className={cn(
                "text-white text-[20px] leading-[22px] font-medium",
                "font-['CodecProVariable',sans-serif]",
                "flex items-center w-[537px] h-[44px]"
              )}
            >
              Насладитесь всеми возможностями БАЛАНСИАГА уже сегодня!
            </p>

            {/* Кнопка */}
            <button
              className={cn(
                "flex flex-row items-center justify-center",
                "w-[92px] h-[38px]",
                "px-[10px] gap-[10px]",
                "bg-gradient-to-r from-[#7C6CF1] via-[#6C5DD7] to-[#5544D1]",
                "rounded-[37px]",
                "hover:opacity-90 transition-opacity"
              )}
            >
              <span
                className={cn(
                  "text-white text-[16px] leading-[18px] font-normal",
                  "font-['CodecProVariable',sans-serif]",
                  "flex items-center w-[72px] h-[18px]"
                )}
              >
                Кнопка
              </span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
