"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AuthInput } from "@/components/ui/auth-input";
import { useTheme } from "@/components/theme-provider";
import { AUTH_BG_GRADIENT, AUTH_BG_GRADIENT_LIGHT } from "@/lib/gradients";
import { ACCENT } from "@/lib/colors";

const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

async function readError(res: Response) {
  try {
    const data = await res.json();
    // Handle validation errors (422)
    if (Array.isArray(data?.detail)) {
      const errors = data.detail.map((err: any) => {
        const field = err.loc?.[err.loc.length - 1] || "поле";
        const msg = err.msg || "неверное значение";
        if (field === "login") {
          if (msg.includes("at least") || msg.includes("ensure this value has at least")) {
            return "Логин должен содержать минимум 3 символа";
          }
          if (msg.includes("at most") || msg.includes("ensure this value has at most")) {
            return "Логин должен содержать максимум 64 символа";
          }
        }
        if (field === "password") {
          if (msg.includes("at least") || msg.includes("ensure this value has at least")) {
            return "Пароль должен содержать минимум 8 символов";
          }
          if (msg.includes("at most") || msg.includes("ensure this value has at most")) {
            return "Пароль должен содержать максимум 128 символов";
          }
        }
        return `${field}: ${msg}`;
      });
      return errors.join(". ");
    }
    if (typeof data?.detail === "string") {
      // Translate specific error messages
      if (data.detail === "Login already exists") {
        return "Пользователь уже зарегистрирован";
      }
      return data.detail;
    }
  } catch {
    // ignore parse errors
  }
  return "Что-то пошло не так...";
}

export default function RegisterPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegisterButtonHovered, setIsRegisterButtonHovered] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Validate login length
    const trimmedLogin = login.trim();
    if (trimmedLogin.length < 3) {
      setError("Логин должен содержать минимум 3 символа");
      return;
    }
    if (trimmedLogin.length > 64) {
      setError("Логин должен содержать максимум 64 символа");
      return;
    }

    // Validate password length
    if (password.length < 8) {
      setError("Пароль должен содержать минимум 8 символов");
      return;
    }
    if (password.length > 128) {
      setError("Пароль должен содержать максимум 128 символов");
      return;
    }

    // Validate password confirmation
    if (password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: trimmedLogin, password }),
    });

    if (!response.ok) {
      setError(await readError(response));
      setIsSubmitting(false);
      return;
    }

    const signInResult = await signIn("credentials", {
      redirect: false,
      login: trimmedLogin,
      password,
      callbackUrl: "/dashboard",
    });

    setIsSubmitting(false);

    if (signInResult?.error) {
      setError("Регистрация завершена, но вход не удался. Попробуйте войти.");
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
        {/* Header Text */}
        <h2 className="text-foreground text-center">Введите логин и пароль</h2>

        {/* Registration Form */}
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
              placeholder="Введите желаемый логин"
            />
          </div>
          <div className="space-y-2">
            <AuthInput
              icon="lock"
              gradientDirection="right-to-left"
              autoComplete="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Введите желаемый пароль"
            />
          </div>
          <div className="space-y-2">
            <AuthInput
              icon="lock"
              gradientDirection="right-to-left"
              autoComplete="new-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Повторите введенный пароль"
            />
          </div>
          <Button 
            className="w-full h-12 text-base font-bold text-white rounded-lg border-0"
            style={{
              background: isRegisterButtonHovered
                ? "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)"
                : "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
              transition: "background 1000ms ease",
            }}
            onMouseEnter={() => setIsRegisterButtonHovered(true)}
            onMouseLeave={() => setIsRegisterButtonHovered(false)}
            type="submit" 
            disabled={isSubmitting}
          >
            {isSubmitting ? "Регистрация..." : "Зарегистрироваться"}
          </Button>
        </form>

        {/* Login Link */}
        <div className="text-center text-sm">
          <span className="text-muted-foreground">Есть аккаунт? </span>
          <Link href="/login" className="font-medium" style={{ color: ACCENT }}>
            Войти
          </Link>
        </div>
      </div>
    </main>
  );
}
