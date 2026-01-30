"use client";

import React, { useEffect, useRef } from "react";
import { MoreVertical, Pencil, Trash2, User, Factory } from "lucide-react";
import { useImagePreloader } from "@/hooks/use-image-preloader";
import { IconButton } from "@/components/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CounterpartyOut, API_BASE } from "@/lib/api";
import {
  MODAL_BG,
  BACKGROUND_DT,
  PLACEHOLDER_COLOR_DARK,
  ACTIVE_TEXT_DARK,
} from "@/lib/colors";
import type { LucideIcon } from "lucide-react";

const INDUSTRY_ICON_BY_ID: Record<number, LucideIcon> = {};
function getLegalDefaultIcon(industryId: number | null): LucideIcon {
  if (!industryId) return Factory;
  return INDUSTRY_ICON_BY_ID[industryId] ?? Factory;
}

function buildPersonName(counterparty: CounterpartyOut) {
  if (counterparty.entity_type !== "PERSON") return counterparty.name;
  const parts = [
    counterparty.last_name,
    counterparty.first_name,
    counterparty.middle_name,
  ].filter(Boolean);
  return parts.join(" ") || counterparty.name;
}

const ENTITY_LABELS: Record<string, string> = {
  LEGAL: "ЮЛ/ИП",
  PERSON: "ФЛ",
};

export interface CounterpartyCardProps {
  counterparty: CounterpartyOut;
  industryLabel?: string;
  legalFormLabel?: string;
  onEdit?: (counterparty: CounterpartyOut) => void;
  onDelete?: (counterparty: CounterpartyOut) => void;
  onReady?: () => void;
}

export function CounterpartyCard({
  counterparty,
  industryLabel = "",
  legalFormLabel = "",
  onEdit,
  onDelete,
  onReady,
}: CounterpartyCardProps) {
  const isDeleted = Boolean(counterparty.deleted_at);
  const isUser = Boolean(counterparty.owner_user_id);
  const title =
    counterparty.entity_type === "PERSON"
      ? buildPersonName(counterparty)
      : counterparty.name;
  const entityLabel = ENTITY_LABELS[counterparty.entity_type] ?? counterparty.entity_type;

  const imageUrl =
    counterparty.entity_type === "PERSON"
      ? counterparty.photo_url
      : counterparty.logo_url;
  const imageUrlFull = imageUrl
    ? imageUrl.startsWith("http")
      ? imageUrl
      : imageUrl.startsWith("/")
      ? `${API_BASE}${imageUrl}`
      : `${API_BASE}/${imageUrl}`
    : null;

  const imageUrls = [imageUrlFull ?? null];
  const { isReady: isCardReady, setImageRef, handleImageLoad, handleImageError } =
    useImagePreloader({ imageUrls, cacheCheckDelay: 0 });
  const hasCalledOnReadyRef = useRef(false);
  useEffect(() => {
    if (isCardReady && onReady && !hasCalledOnReadyRef.current) {
      hasCalledOnReadyRef.current = true;
      onReady();
    }
  }, [isCardReady, onReady]);

  const FallbackIcon =
    counterparty.entity_type === "PERSON"
      ? User
      : getLegalDefaultIcon(counterparty.industry_id ?? null);

  const cardBg = isDeleted ? BACKGROUND_DT : MODAL_BG;
  const textColor = isDeleted ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK;

  return (
    <div
      className="relative rounded-lg overflow-hidden"
      style={{
        backgroundColor: cardBg,
      }}
    >
      <div className="p-[12px]">
        <div className="flex items-start justify-between mb-3 gap-3">
          {/* Изображение 100x100 */}
          <div className="w-[100px] h-[100px] flex items-center justify-center shrink-0">
            {imageUrlFull ? (
              <img
                ref={(el) => setImageRef(0, el)}
                src={imageUrlFull}
                alt=""
                className="w-[100px] h-[100px] rounded-lg object-contain"
                style={{
                  filter: "drop-shadow(0 34px 48.8px rgba(0,0,0,0.25))",
                  backgroundColor: "transparent",
                }}
                onLoad={() => handleImageLoad(0)}
                onError={() => handleImageError(0)}
              />
            ) : (
              <div
                className="w-[100px] h-[100px] rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: `${PLACEHOLDER_COLOR_DARK}20`,
                  filter: "drop-shadow(0 34px 48.8px rgba(0,0,0,0.25))",
                }}
              >
                <FallbackIcon
                  className="w-16 h-16"
                  style={{ color: PLACEHOLDER_COLOR_DARK }}
                  strokeWidth={1.5}
                />
              </div>
            )}
          </div>

          {/* Центр: тип + название */}
          <div className="flex flex-col items-center justify-center flex-1 min-w-0">
            <div className="w-full text-center mb-1">
              <span
                className="text-sm font-normal text-center"
                style={{ color: PLACEHOLDER_COLOR_DARK }}
              >
                {entityLabel}
              </span>
            </div>
            <h3
              className="text-2xl font-medium mb-1 text-center break-words max-w-full"
              style={{ color: textColor }}
            >
              {title}
            </h3>
            {counterparty.entity_type === "LEGAL" &&
              counterparty.full_name &&
              counterparty.full_name.trim() && (
              <div className="w-full text-center mb-1">
                <span
                  className="text-sm font-normal text-center break-words max-w-full"
                  style={{ color: PLACEHOLDER_COLOR_DARK }}
                >
                  {[legalFormLabel, `«${counterparty.full_name.trim()}»`]
                    .filter(Boolean)
                    .join(" ")}
                </span>
              </div>
            )}
            {counterparty.entity_type === "LEGAL" &&
              (counterparty.inn || counterparty.ogrn) && (
              <div className="w-full text-center mb-1">
                <span
                  className="text-sm font-normal text-center break-words max-w-full"
                  style={{ color: PLACEHOLDER_COLOR_DARK }}
                >
                  {[
                    counterparty.inn && `ИНН: ${counterparty.inn}`,
                    counterparty.ogrn && `ОГРН: ${counterparty.ogrn}`,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </span>
              </div>
            )}
            {industryLabel && (
              <span
                className="text-sm font-normal text-center"
                style={{ color: PLACEHOLDER_COLOR_DARK }}
              >
                {industryLabel}
              </span>
            )}
          </div>

          {/* Меню */}
          {isUser && (
            <div className="shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton aria-label="Открыть меню действий">
                    <MoreVertical />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {!isDeleted && onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(counterparty)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Редактировать
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(counterparty)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Удалить
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Доп. информация: для ФЛ — полное наименование и ИНН/ОГРН при наличии; для ЮЛ/ИП ИНН/ОГРН уже в блоке над отраслью */}
        {((counterparty.entity_type !== "LEGAL" && counterparty.full_name) ||
          (counterparty.entity_type !== "LEGAL" &&
            (counterparty.inn || counterparty.ogrn))) && (
          <div
            className="space-y-1 text-xs mt-2 text-center"
            style={{ color: PLACEHOLDER_COLOR_DARK }}
          >
            {counterparty.entity_type === "PERSON" && counterparty.full_name && (
              <div className="truncate">{counterparty.full_name}</div>
            )}
            {counterparty.entity_type === "PERSON" &&
              (counterparty.inn || counterparty.ogrn) && (
                <div className="truncate">
                  {[
                    counterparty.inn && `ИНН: ${counterparty.inn}`,
                    counterparty.ogrn && `ОГРН: ${counterparty.ogrn}`,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
