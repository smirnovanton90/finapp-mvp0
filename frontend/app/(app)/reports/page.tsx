import Link from "next/link";
import { cn } from "@/lib/utils";
import { ACTIVE_TEXT_DARK, MODAL_BG, PLACEHOLDER_COLOR_DARK } from "@/lib/colors";

function ReportChartPreview({ id }: { id: string }) {
  const width = 280;
  const height = 140;
  const padding = { left: 52, right: 12, top: 16, bottom: 28 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const chartMin = -20000;
  const chartMax = 60000;
  const ticks = [60000, 40000, 20000, 0, -20000];
  const points = [
    { x: 0, v: -5000 },
    { x: 0.15, v: -8000 },
    { x: 0.55, v: 40000 },
    { x: 1, v: 10000 },
  ].map(({ x, v }) => ({
    x: padding.left + x * innerWidth,
    y:
      padding.top +
      innerHeight -
      ((v - chartMin) / (chartMax - chartMin)) * innerHeight,
    v,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="min-h-[120px]"
      aria-hidden
    >
      <defs>
        <linearGradient id={`reportAreaGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8D63FF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8D63FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#reportAreaGrad-${id})`} />
      <path
        d={linePath}
        fill="none"
        stroke="#8D63FF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {ticks.map((tick) => {
        const ratio = (tick - chartMin) / (chartMax - chartMin);
        const y = padding.top + innerHeight - innerHeight * ratio;
        const label = new Intl.NumberFormat("ru-RU", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(tick);
        return (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="rgba(197, 191, 241, 0.35)"
              strokeDasharray="4 6"
            />
            <text
              x={padding.left - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="10"
              fill="rgba(197, 191, 241, 0.6)"
            >
              {label}
            </text>
          </g>
        );
      })}
      <text
        x={padding.left}
        y={height - 8}
        textAnchor="start"
        fontSize="10"
        fill="rgba(197, 191, 241, 0.6)"
      >
        01.12.25
      </text>
      <text
        x={width - padding.right}
        y={height - 8}
        textAnchor="end"
        fontSize="10"
        fill="rgba(197, 191, 241, 0.6)"
      >
        06.12.25
      </text>
    </svg>
  );
}

function ReportCard({
  href,
  title,
  description,
  className,
}: {
  href: string;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col gap-6 rounded-lg overflow-hidden border-0 outline-none p-6 sm:flex-row sm:items-stretch sm:gap-8",
        "transition-transform duration-200 ease-out hover:-translate-y-1",
        className
      )}
      style={{ backgroundColor: MODAL_BG }}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <h2 className="text-lg font-semibold sm:text-xl" style={{ color: ACTIVE_TEXT_DARK }}>
          {title}
        </h2>
        <p className="text-sm leading-snug" style={{ color: PLACEHOLDER_COLOR_DARK }}>
          {description}
        </p>
      </div>
      <div className="flex shrink-0 items-center justify-end sm:w-[45%] sm:min-w-[200px]">
        <div className="h-[120px] w-full max-w-[280px] sm:h-[140px]">
          <ReportChartPreview id={href.replace(/^\//, "").replace(/\//g, "-")} />
        </div>
      </div>
    </Link>
  );
}

export default function ReportsPage() {
  return (
    <main className="min-h-screen px-8 py-8 flex flex-col items-center">
      <div className="w-full max-w-[900px] space-y-6">
        <section className="flex flex-col gap-6">
          <ReportCard
            href="/reports/assets-dynamics"
            title="Динамика стоимости активов"
            description="Отчет, в котором можно отследить стоимость одного или нескольких активов / обязательств"
          />
          <ReportCard
            href="/reports/income-expense-dynamics"
            title="Динамика доходов и расходов по категориям"
            description="Свод по фактическим транзакциям с пересчетом в рубли по курсу даты операции"
          />
          <ReportCard
            href="/reports/counterparty-settlements"
            title="Расчёты с контрагентом"
            description="Отчет о задолженностях и расчётах с контрагентами"
          />
        </section>
      </div>
    </main>
  );
}
