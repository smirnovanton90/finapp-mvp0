import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinApp",
  description: "Учёт активов, транзакций и планирование финансов",
  // Добавить на экран «Домой» в Safari на iPhone
  appleWebApp: {
    capable: true,
    title: "FinApp",
    statusBarStyle: "default",
  },
  // Иконка на домашнем экране (180×180). При наличии app/apple-icon.png Next.js подставит её сам.
  icons: {
    apple: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1E2128" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}