"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ACCENT, SIDEBAR_TEXT_INACTIVE } from "@/lib/colors";
import { APP_BG_START, AUTH_WINDOW_GRADIENT } from "@/lib/gradients";

export const AUTH_PRIMARY_STYLE = {
  "--auth-primary-bg":
    "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
  "--auth-primary-bg-hover":
    "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
} as CSSProperties;

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="min-h-dvh p-4 md:flex md:h-dvh md:items-stretch md:gap-7 md:p-7"
      style={{ background: APP_BG_START }}
    >
      <section
        className="flex h-[280px] flex-col justify-end gap-3 rounded-[28px] px-6 pb-7 md:h-auto md:min-h-0 md:flex-1 md:gap-5 md:px-14 md:pb-[72px]"
        style={{ background: AUTH_WINDOW_GRADIENT }}
      >
        <h1 className="text-[40px] font-bold leading-none text-white md:text-[76px]">ФИНАТИК</h1>
        <p className="text-base leading-snug md:text-xl" style={{ color: SIDEBAR_TEXT_INACTIVE }}>
          Полная картина Ваших финансов
        </p>
      </section>
      <section className="mt-5 flex w-full flex-col justify-center md:mt-0 md:h-auto md:w-[520px] md:shrink-0 md:pl-9 md:pr-12">
        <div className="flex w-full flex-col gap-[18px] md:gap-4">{children}</div>
      </section>
    </main>
  );
}

export function AuthTextLink({
  href,
  muted,
  label,
}: {
  href: string;
  muted: string;
  label: string;
}) {
  return (
    <div className="text-center text-sm">
      <span style={{ color: SIDEBAR_TEXT_INACTIVE }}>{muted} </span>
      <Link href={href} className="font-medium" style={{ color: ACCENT }}>
        {label}
      </Link>
    </div>
  );
}

const YANDEX_BUTTON_STYLE = {
  "--yandex-bg":
    "linear-gradient(135deg, rgba(72, 59, 166, 0.72) 0%, rgba(108, 93, 215, 0.5) 57%, rgba(108, 93, 215, 0.5) 79%, rgba(148, 135, 243, 0.62) 100%)",
  "--yandex-bg-hover":
    "linear-gradient(315deg, rgba(148, 135, 243, 0.72) 0%, rgba(108, 93, 215, 0.5) 57%, rgba(108, 93, 215, 0.5) 79%, rgba(72, 59, 166, 0.62) 100%)",
} as CSSProperties;

export function YandexAuthButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[10px] px-4 text-[15px] font-medium text-white transition-[background] duration-1000 ease-[ease] [background:var(--yandex-bg)] hover:[background:var(--yandex-bg-hover)] md:h-12"
      style={YANDEX_BUTTON_STYLE}
    >
      <Image
        src="/images/counterparties/counterparty-7736207543.png"
        alt=""
        width={20}
        height={20}
        className="size-5 shrink-0 rounded-full"
        aria-hidden
      />
      Войти через Яндекс
    </button>
  );
}
