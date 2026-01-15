import type { Metadata } from "next";
import { Liter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const liter = Liter({
  subsets: ["latin", "cyrillic"],
  weight: ["400"],
  style: ["normal"],
  variable: "--font-liter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FinApp",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={liter.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}