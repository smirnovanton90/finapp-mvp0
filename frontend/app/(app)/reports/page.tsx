import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ACTIVE_TEXT, SIDEBAR_TEXT_INACTIVE } from "@/lib/colors";
import { BarChart3 } from "lucide-react";
import type { CSSProperties } from "react";

export default function ReportsPage() {
  return (
    <main className="min-h-screen px-8 py-8 flex flex-col items-center">
      <div className="w-full max-w-[720px] space-y-6">
        <header className="flex items-center gap-3">
          <BarChart3
            className="size-[30px]"
            strokeWidth={1.5}
            style={{ color: SIDEBAR_TEXT_INACTIVE }}
          />
          <h1 className="text-2xl font-semibold" style={{ color: ACTIVE_TEXT }}>
            Отчёты
          </h1>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <Button
            asChild
            variant="glass"
            className="h-16 justify-start rounded-[9px] pl-4 pr-4 text-base font-normal"
            style={
              {
                "--glass-bg": "rgba(108, 93, 215, 0.22)",
                "--glass-bg-hover": "rgba(108, 93, 215, 0.32)",
              } as CSSProperties
            }
          >
            <Link href="/reports/assets-dynamics" className="flex w-full items-center gap-3">
              <span className="flex-1 text-left">
                Динамика стоимости активов
              </span>
            </Link>
          </Button>

          <Button
            asChild
            variant="glass"
            className="h-16 justify-start rounded-[9px] pl-4 pr-4 text-base font-normal"
            style={
              {
                "--glass-bg": "rgba(108, 93, 215, 0.22)",
                "--glass-bg-hover": "rgba(108, 93, 215, 0.32)",
              } as CSSProperties
            }
          >
            <Link
              href="/reports/income-expense-dynamics"
              className="flex w-full items-center gap-3"
            >
              <span className="flex-1 text-left">
                Динамика доходов и расходов по категориям
              </span>
            </Link>
          </Button>
        </section>
      </div>
    </main>
  );
}
