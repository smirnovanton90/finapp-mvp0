"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";

import { PINK_GRADIENT } from "@/lib/gradients";
import { assetSectionIconPath } from "@/lib/image-paths";
import { cn } from "@/lib/utils";

type AssetSectionHeadingProps = {
  sectionId: string;
  title: string;
  amountContent: ReactNode;
  variant: "desktop" | "mobile";
};

const ICON_DROP_SHADOW =
  "drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)]";

export function AssetSectionHeading({
  sectionId,
  title,
  amountContent,
  variant,
}: AssetSectionHeadingProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const iconSrc = assetSectionIconPath(sectionId);
  const showIcon = !iconFailed;

  if (variant === "desktop") {
    return (
      <div className="relative overflow-visible pt-5 pb-6 mb-4">
        <div
          className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-2 overflow-visible rounded-lg px-3 py-2"
          style={{ background: PINK_GRADIENT }}
        >
          <div className="relative z-[1] flex min-w-0 max-w-full flex-1 flex-wrap items-center gap-3">
            <h2 className="min-w-0 max-w-full shrink text-2xl font-medium" style={{ color: "rgba(255,255,255,0.95)" }}>
              {title}
            </h2>
            {showIcon ? (
              <div className="relative h-px w-[5.5rem] shrink-0 overflow-visible">
                <Image
                  src={iconSrc}
                  alt=""
                  width={88}
                  height={88}
                  unoptimized
                  className={cn(
                    "pointer-events-none absolute left-0 top-1/2 z-10 h-[5.5rem] w-[5.5rem] -translate-y-1/2 object-contain select-none",
                    ICON_DROP_SHADOW
                  )}
                  onError={() => setIconFailed(true)}
                />
              </div>
            ) : null}
          </div>
          <div className="relative z-[1] inline-flex flex-wrap items-center justify-end gap-1.5">
            {amountContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-visible pt-4 pb-5 mb-3">
      <div
        className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-2 overflow-visible rounded-lg px-3 py-2"
        style={{ background: PINK_GRADIENT }}
      >
        <div className="relative z-[1] flex min-w-0 max-w-full flex-1 flex-wrap items-center gap-2.5">
          <h2 className="min-w-0 max-w-full shrink text-xl font-semibold" style={{ color: "rgba(255,255,255,0.95)" }}>
            {title}
          </h2>
          {showIcon ? (
            <div className="relative h-px w-[4.5rem] shrink-0 overflow-visible">
              <Image
                src={iconSrc}
                alt=""
                width={72}
                height={72}
                unoptimized
                className={cn(
                  "pointer-events-none absolute left-0 top-1/2 z-10 h-[4.5rem] w-[4.5rem] -translate-y-1/2 object-contain select-none",
                  ICON_DROP_SHADOW
                )}
                onError={() => setIconFailed(true)}
              />
            </div>
          ) : null}
        </div>
        <div className="relative z-[1] inline-flex flex-wrap items-center justify-end gap-1.5">
          {amountContent}
        </div>
      </div>
    </div>
  );
}
