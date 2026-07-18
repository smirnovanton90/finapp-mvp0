import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";

/** Цвет chrome iOS PWA / статус-бара — совпадает с мобильным фоном приложения (#191732). */
const PWA_CHROME_COLOR = "#191732";

export const metadata: Metadata = {
  title: "FinApp",
  description: "Учёт активов, транзакций и планирование финансов",
  // black-translucent + viewport-fit=cover: контент под статус-баром, отступы через env(safe-area-inset-*).
  appleWebApp: {
    capable: true,
    title: "FinApp",
    statusBarStyle: "black-translucent",
  },
  // Иконка на домашнем экране (180×180). При наличии app/apple-icon.png Next.js подставит её сам.
  icons: {
    apple: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Один цвет для light/dark: иначе iOS standalone рисует светлую полосу при системной светлой теме.
  themeColor: PWA_CHROME_COLOR,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}