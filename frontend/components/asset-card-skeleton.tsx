"use client";

import React from "react";
import { MODAL_BG, PLACEHOLDER_COLOR_DARK } from "@/lib/colors";

/**
 * Скелетон для карточки актива во время загрузки изображений
 */
export function AssetCardSkeleton() {
  return (
    <div
      className="relative rounded-lg overflow-hidden animate-pulse"
      style={{
        backgroundColor: MODAL_BG,
      }}
    >
      {/* Left stripe skeleton */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: PLACEHOLDER_COLOR_DARK + "40" }}
      />

      <div className="pl-4 pr-4 pt-4 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          {/* Icon skeleton */}
          <div className="w-[100px] h-[100px] flex items-center justify-center shrink-0">
            <div
              className="w-[100px] h-[100px] rounded-lg"
              style={{
                backgroundColor: PLACEHOLDER_COLOR_DARK + "20",
              }}
            />
          </div>

          {/* Info skeleton */}
          <div className="flex flex-col items-center justify-center flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap justify-center">
              <div
                className="h-4 w-20 rounded"
                style={{
                  backgroundColor: PLACEHOLDER_COLOR_DARK + "20",
                }}
              />
              <div
                className="h-5 w-12 rounded-full"
                style={{
                  backgroundColor: PLACEHOLDER_COLOR_DARK + "20",
                }}
              />
            </div>
            <div
              className="h-7 w-32 mb-1 rounded"
              style={{
                backgroundColor: PLACEHOLDER_COLOR_DARK + "20",
              }}
            />
            <div
              className="h-4 w-24 rounded"
              style={{
                backgroundColor: PLACEHOLDER_COLOR_DARK + "20",
              }}
            />
          </div>

          {/* Menu skeleton */}
          <div className="shrink-0">
            <div
              className="h-8 w-8 rounded"
              style={{
                backgroundColor: PLACEHOLDER_COLOR_DARK + "20",
              }}
            />
          </div>
        </div>

        {/* Financial info skeleton */}
        <div className="grid grid-cols-3 gap-4 mt-3 justify-items-center">
          <div className="text-center w-full">
            <div
              className="h-4 w-16 mx-auto mb-1 rounded"
              style={{
                backgroundColor: PLACEHOLDER_COLOR_DARK + "20",
              }}
            />
            <div
              className="h-6 w-20 mx-auto rounded"
              style={{
                backgroundColor: PLACEHOLDER_COLOR_DARK + "20",
              }}
            />
          </div>
          <div className="text-center w-full">
            <div
              className="h-4 w-16 mx-auto mb-1 rounded"
              style={{
                backgroundColor: PLACEHOLDER_COLOR_DARK + "20",
              }}
            />
            <div
              className="h-6 w-20 mx-auto rounded"
              style={{
                backgroundColor: PLACEHOLDER_COLOR_DARK + "20",
              }}
            />
          </div>
          <div className="text-center w-full">
            <div
              className="h-4 w-16 mx-auto mb-1 rounded"
              style={{
                backgroundColor: PLACEHOLDER_COLOR_DARK + "20",
              }}
            />
            <div
              className="h-8 w-24 mx-auto rounded"
              style={{
                backgroundColor: PLACEHOLDER_COLOR_DARK + "20",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
