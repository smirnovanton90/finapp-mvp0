"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AuthInput } from "@/components/ui/auth-input";
import { useTheme } from "@/components/theme-provider";
import { AUTH_BG_GRADIENT, AUTH_BG_GRADIENT_LIGHT, PINK_GRADIENT } from "@/lib/gradients";
import { ACCENT } from "@/lib/colors";

export default function LoginPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      redirect: false,
      login,
      password,
      callbackUrl: "/dashboard",
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError("Неверный логин или пароль");
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <main className="flex flex-col min-h-screen px-6 relative overflow-hidden">
      {/* Background crossfade between dark/light */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700 ease-in-out"
        style={{
          background: AUTH_BG_GRADIENT,
          opacity: isDark ? 1 : 0,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700 ease-in-out"
        style={{
          background: AUTH_BG_GRADIENT_LIGHT,
          opacity: isDark ? 0 : 1,
        }}
      />

      {/* Логотип — фиксированная позиция, top 100px, ширина до 1800px, растягивается по ширине */}
      <div className="absolute top-[100px] left-1/2 -translate-x-1/2 w-full max-w-[1800px] z-10 px-6 aspect-[1800/554]">
        <div className="relative w-full h-full">
          <Image
            src="/images/LOGO3.png"
            alt="ПРОСТОФИН"
            fill
            className="object-contain object-center"
            priority
            sizes="(max-width: 1800px) 100vw, 1800px"
          />
        </div>
      </div>
      
      {/* Контент под логотипом (отступ: top 100px + высота лого по aspect 1800/554) */}
      <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center pt-[min(654px,calc(100px+30.8vw))] -translate-y-[8vh]">
        <div className="w-full max-w-[400px] flex flex-col items-center space-y-6">
        {/* Header */}
        <h1 className="text-4xl font-bold text-foreground">
          <span
            style={{
              backgroundImage: PINK_GRADIENT,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}
          >
            Привет!
          </span>{" "}
          <span aria-hidden>👋</span>
        </h1>

        {/* Login Form */}
        <form className="w-full space-y-4" onSubmit={handleSubmit}>
          {/* Error Message */}
          {error && (
            <div 
              className="w-full rounded-lg px-4 py-3 text-center"
              style={{
                backgroundColor: isDark ? "rgba(108, 93, 215, 0.22)" : "rgba(108, 93, 215, 0.12)",
              }}
            >
              <p className="text-sm" style={{ color: "#FB4C4F" }}>
                {error}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <AuthInput
              icon="user"
              gradientDirection="left-to-right"
              autoComplete="username"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              placeholder="Логин"
            />
          </div>
          <div className="space-y-2">
            <AuthInput
              icon="lock"
              gradientDirection="right-to-left"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Пароль"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setError("Грустно, конечно, но пока эта кнопка не работает 😉");
                }}
                className="text-sm font-medium cursor-pointer"
                style={{ color: ACCENT }}
              >
                Забыли пароль?
              </button>
            </div>
          </div>
          <Button 
            variant="authPrimary"
            className="w-full h-12 text-base font-bold rounded-lg border-0"
            style={
              {
                "--auth-primary-bg":
                  "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                "--auth-primary-bg-hover":
                  "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
              } as CSSProperties
            }
            type="submit" 
            disabled={isSubmitting}
          >
            {isSubmitting ? "Вход..." : "Войти"}
          </Button>
        </form>

        {/* Registration Link */}
        <div className="text-center text-sm">
          <span className="text-muted-foreground">Нет аккаунта? </span>
          <Link href="/register" className="font-medium" style={{ color: ACCENT }}>
            Зарегистрируйтесь
          </Link>
        </div>

        {/* Кнопка входа через Яндекс — сразу под ссылкой «Зарегистрируйтесь» */}
        <div className="w-full flex justify-center">
          <Button
            variant="glass"
            className="h-12 w-12 rounded-[9px] p-0 flex items-center justify-center"
            style={
              {
                "--glass-bg": isDark ? "rgba(108, 93, 215, 0.22)" : "rgba(108, 93, 215, 0.12)",
                "--glass-bg-hover": isDark
                  ? "rgba(108, 93, 215, 0.4)"
                  : "rgba(108, 93, 215, 0.18)",
              } as CSSProperties
            }
            onClick={() => signIn("yandex", { callbackUrl: "/dashboard" })}
            title="Войти через Яндекс"
            aria-label="Войти через Яндекс"
          >
            <Image
              src="/images/counterparties/counterparty-7736207543.png"
              alt=""
              width={32}
              height={32}
              className="shrink-0"
              aria-hidden
            />
          </Button>
        </div>
        </div>
      </div>
    </main>
  );
}
