"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
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
    <main className="flex min-h-screen items-center justify-center px-6 relative overflow-hidden">
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
      
      <div className="relative z-10 w-full max-w-[400px] flex flex-col items-center space-y-6">
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

        {/* Google Login Button */}
        <Button
          variant="glass"
          className="w-full h-12 text-base font-medium relative flex items-center justify-center"
          style={
            {
              // keep exact design values from the original implementation
              "--glass-bg": isDark ? "rgba(108, 93, 215, 0.22)" : "rgba(108, 93, 215, 0.12)",
              "--glass-bg-hover": isDark
                ? "rgba(108, 93, 215, 0.4)"
                : "rgba(108, 93, 215, 0.18)",
            } as CSSProperties
          }
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        >
          {/* Google G Logo - positioned left */}
          <div className="absolute left-4 flex items-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.6 10.2273C19.6 9.51818 19.5364 8.83636 19.4182 8.18182H10V12.05H15.3818C15.15 13.3 14.4455 14.3591 13.3864 15.0682V17.5773H16.6182C18.5091 15.8364 19.6 13.2727 19.6 10.2273Z" fill="#4285F4"/>
              <path d="M10 20C12.7 20 14.9636 19.1045 16.6182 17.5773L13.3864 15.0682C12.4909 15.6682 11.3455 16.0227 10 16.0227C7.39545 16.0227 5.19091 14.2636 4.40455 11.9H1.06364V14.4909C2.70909 17.7591 6.09091 20 10 20Z" fill="#34A853"/>
              <path d="M4.40455 11.9C4.20455 11.3 4.09091 10.6591 4.09091 10C4.09091 9.34091 4.20455 8.7 4.40455 8.1V5.50909H1.06364C0.386364 6.85909 0 8.38636 0 10C0 11.6136 0.386364 13.1409 1.06364 14.4909L4.40455 11.9Z" fill="#FBBC05"/>
              <path d="M10 3.97727C11.4682 3.97727 12.7864 4.48182 13.8227 5.47273L16.6909 2.60455C14.9591 0.990909 12.6955 0 10 0C6.09091 0 2.70909 2.24091 1.06364 5.50909L4.40455 8.1C5.19091 5.73636 7.39545 3.97727 10 3.97727Z" fill="#EA4335"/>
            </svg>
          </div>
          {/* Text centered */}
          <span>Войти через Google</span>
        </Button>

        {/* Separator */}
        <div className="text-muted-foreground text-sm">или</div>

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
      </div>
    </main>
  );
}
