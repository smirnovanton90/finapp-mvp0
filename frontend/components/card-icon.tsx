"use client";

import React from "react";

const DEFAULT_SHADOW = "drop-shadow(0 34px 48.8px rgba(0,0,0,0.25))";

/** Преобразует size (строка вроде "100px" или "1.5rem") в число пикселей. */
function parseSizeToPx(size: string): number {
  const s = size.trim();
  const match = s.match(/^(-?[\d.]+)(px|rem|em)$/i);
  if (!match) return 16;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "px") return value;
  return Math.round(value * 16);
}

export type CardIconFallbackProps = {
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
};

export interface CardIconProps {
  /** URL изображения; при null показывается fallbackIcon */
  src: string | null;
  alt: string;
  /** Иконка при отсутствии src или ошибке загрузки (Lucide или компонент с className/style/strokeWidth). Без фона и обводки. */
  fallbackIcon?: React.ComponentType<CardIconFallbackProps>;
  /** Размер: число (px) или строка (например "100px", "1.5rem") */
  size?: number | string;
  /** Добавлять тень (drop-shadow) */
  shadow?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: () => void;
  onError?: () => void;
  /** Ref для img (для preloader: ref={(el) => setImageRef(0, el)}) */
  imgRef?: React.Ref<HTMLImageElement | null>;
  /** Цвет fallback-иконки */
  fallbackIconColor?: string;
  /** object-fit для img */
  objectFit?: "contain" | "cover";
}

/**
 * Единый компонент отображения иконки/картинки на карточках.
 * Без фона и обводки. Настраиваемый размер и опциональная тень.
 */
export function CardIcon({
  src,
  alt,
  fallbackIcon: FallbackIcon,
  size = 100,
  shadow = false,
  className = "",
  style,
  onLoad,
  onError,
  imgRef,
  fallbackIconColor,
  objectFit = "contain",
}: CardIconProps) {
  const [errored, setErrored] = React.useState(false);
  const showImage = src && !errored;
  const sizeVal = typeof size === "number" ? `${size}px` : size;
  const sizePx =
    typeof size === "number"
      ? size
      : parseSizeToPx(size);
  const radiusPx = Math.max(2, Math.round(sizePx * 0.08));
  const boxStyle: React.CSSProperties = {
    width: sizeVal,
    height: sizeVal,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: `${radiusPx}px`,
    ...(shadow ? { filter: DEFAULT_SHADOW } : {}),
    ...style,
  };

  const handleError = () => {
    setErrored(true);
    onError?.();
  };

  React.useEffect(() => {
    setErrored(false);
  }, [src]);

  if (showImage) {
    return (
      <div
        className={className}
        style={boxStyle}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          style={{
            width: sizeVal,
            height: sizeVal,
            objectFit,
            ...(shadow ? { filter: DEFAULT_SHADOW } : {}),
          }}
          onLoad={onLoad}
          onError={handleError}
        />
      </div>
    );
  }

  if (FallbackIcon) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={boxStyle}>
        <FallbackIcon
          className="w-[60%] h-[60%]"
          style={fallbackIconColor ? { color: fallbackIconColor } : undefined}
          strokeWidth={1.5}
        />
      </div>
    );
  }

  return null;
}
