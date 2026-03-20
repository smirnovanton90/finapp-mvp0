/**
 * Инициализация воркера pdf.js для парсинга PDF в браузере.
 * Вызывать перед первым getDocument().
 */

import "@/lib/import/pdfjs-polyfill";
import { GlobalWorkerOptions } from "pdfjs-dist";

let workerInitialized = false;

export function ensurePdfWorkerSrc(): void {
  if (workerInitialized) return;
  if (typeof window === "undefined") return;
  if (GlobalWorkerOptions.workerSrc) {
    workerInitialized = true;
    return;
  }
  GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs`;
  workerInitialized = true;
}
