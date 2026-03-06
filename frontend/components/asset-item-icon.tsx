"use client";

import React, { useState, useEffect } from "react";
import { User, Building2 } from "lucide-react";
import { ItemOut, CounterpartyOut } from "@/lib/api";
import { useCounterpartyImage } from "@/hooks/use-counterparty-image";
import { CardIcon } from "@/components/card-icon";
import { assetIconPath } from "@/lib/image-paths";
import { TYPE_ICON_BY_CODE } from "@/lib/asset-icons";
import { getItemPhotoUrl } from "@/lib/item-utils";

/**
 * Иконка актива по приоритету:
 * 1. Иконка контрагента (если есть)
 * 2. Фото актива (если пользователь загрузил)
 * 3. 3D иконка актива
 * 4. 2D иконка актива (Lucide)
 */
export function AssetItemIcon({
  item,
  counterparty,
  apiBase,
  size = 24,
  className,
  fallbackIconColor,
  alt = "",
  shadow = false,
  objectFit = "contain",
}: {
  item: ItemOut;
  counterparty: CounterpartyOut | null;
  apiBase: string;
  size?: number;
  className?: string;
  fallbackIconColor?: string;
  alt?: string;
  shadow?: boolean;
  objectFit?: "contain" | "cover";
}) {
  const [iconFormat, setIconFormat] = useState<"png" | null>("png");
  const [photoError, setPhotoError] = useState(false);
  const icon3dPath = assetIconPath(item.type_code, iconFormat);
  const TypeIcon = TYPE_ICON_BY_CODE[item.type_code];
  const itemPhotoUrl = getItemPhotoUrl(item, apiBase);

  useEffect(() => {
    setPhotoError(false);
  }, [item?.id, item?.photo_url, apiBase]);

  const {
    currentSrc: counterpartySrc,
    onError: counterpartyOnError,
    showFallbackIcon: showCounterpartyFallback,
  } = useCounterpartyImage(counterparty, apiBase);

  // 1. Контрагент
  if (counterparty && apiBase) {
    const FallbackIcon = counterparty.entity_type === "PERSON" ? User : Building2;
    return (
      <CardIcon
        src={counterpartySrc && !showCounterpartyFallback ? counterpartySrc : null}
        alt={alt}
        fallbackIcon={FallbackIcon}
        size={size}
        shadow={shadow}
        className={className}
        onError={counterpartyOnError}
        fallbackIconColor={fallbackIconColor}
        objectFit={objectFit}
      />
    );
  }

  // 2. Фото актива (загруженное пользователем)
  if (itemPhotoUrl && !photoError) {
    return (
      <CardIcon
        src={itemPhotoUrl}
        alt={alt}
        fallbackIcon={TypeIcon ?? undefined}
        size={size}
        shadow={shadow}
        className={className}
        fallbackIconColor={fallbackIconColor}
        objectFit={objectFit}
        onError={() => setPhotoError(true)}
      />
    );
  }

  // 3. 3D иконка актива
  if (icon3dPath) {
    return (
      <CardIcon
        src={icon3dPath}
        alt={alt}
        fallbackIcon={TypeIcon ?? undefined}
        size={size}
        shadow={shadow}
        className={className}
        fallbackIconColor={fallbackIconColor}
        objectFit={objectFit}
        onError={() => setIconFormat(null)}
      />
    );
  }

  // 4. 2D иконка актива
  if (TypeIcon) {
    return (
      <CardIcon
        src={null}
        alt={alt}
        fallbackIcon={TypeIcon}
        size={size}
        shadow={shadow}
        className={className}
        fallbackIconColor={fallbackIconColor}
        objectFit={objectFit}
      />
    );
  }

  return null;
}
