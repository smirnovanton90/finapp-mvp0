"use client";

import { User, Building2 } from "lucide-react";
import type { CounterpartyOut } from "@/lib/api";
import { useCounterpartyImage } from "@/hooks/use-counterparty-image";
import { CardIcon } from "@/components/card-icon";

type CounterpartyIconImageProps = {
  counterparty: CounterpartyOut | null;
  apiBase: string;
  size?: number;
  className?: string;
  fallbackIconColor?: string;
  alt?: string;
  shadow?: boolean;
};

/**
 * Единый компонент иконки контрагента: useCounterpartyImage + CardIcon (каскад URL и fallback User/Building2).
 * Переиспользует общий CardIcon для отображения изображения или fallback-иконки.
 */
export function CounterpartyIconImage({
  counterparty,
  apiBase,
  size = 24,
  className = "",
  fallbackIconColor,
  alt = "",
  shadow = false,
}: CounterpartyIconImageProps) {
  const {
    currentSrc,
    onError,
    showFallbackIcon,
  } = useCounterpartyImage(counterparty, apiBase);

  if (!counterparty) return null;

  const FallbackIcon =
    counterparty.entity_type === "PERSON" ? User : Building2;

  return (
    <CardIcon
      src={currentSrc && !showFallbackIcon ? currentSrc : null}
      alt={alt}
      fallbackIcon={FallbackIcon}
      size={size}
      shadow={shadow}
      className={className}
      onError={onError}
      fallbackIconColor={fallbackIconColor}
      objectFit="contain"
    />
  );
}
