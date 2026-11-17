"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthShell, AuthTextLink, AUTH_PRIMARY_STYLE } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { AuthInput } from "@/components/ui/auth-input";
import { ACCENT_FILL_LIGHT, RED } from "@/lib/colors";

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
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <AuthShell>
      <h2 className="text-center text-2xl font-semibold leading-none text-white md:text-4xl md:leading-[1.125]">
        Регистрация
      </h2>

      <form className="flex w-full flex-col gap-[18px] md:gap-4" onSubmit={handleSubmit}>
        {error && (
          <div className="w-full rounded-lg px-4 py-3 text-center" style={{ backgroundColor: ACCENT_FILL_LIGHT }}>
            <p className="text-sm" style={{ color: RED }}>
              {error}
            </p>
          </div>
        )}

        <AuthInput
          autoComplete="username"
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          placeholder="Введите желаемый логин"
          controlClassName="h-[50px] md:h-10"
        />
        <AuthInput
          autoComplete="new-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Введите желаемый пароль"
          controlClassName="h-[50px] md:h-10"
        />
        <AuthInput
          autoComplete="new-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Повторите введенный пароль"
          controlClassName="h-[50px] md:h-10"
        />
        <Button
          variant="authPrimary"
          className="h-[50px] w-full rounded-[10px] border-0 text-base font-medium md:h-12 md:font-bold"
          style={AUTH_PRIMARY_STYLE}
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Регистрация..." : "Зарегистрироваться"}
        </Button>
      </form>

      <AuthTextLink href="/login" muted="Есть аккаунт?" label="Войти" />
    </AuthShell>
  );
}
