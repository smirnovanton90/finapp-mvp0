import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "./providers";
import { Sidebar } from "../components/ui/sidebar";

export const metadata: Metadata = {
  title: "FinApp",
  description: "Personal finance",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          <div className="flex h-screen bg-muted/40 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-auto px-8 py-8">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}