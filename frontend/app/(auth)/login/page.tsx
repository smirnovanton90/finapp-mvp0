"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthShell, AuthTextLink, AUTH_PRIMARY_STYLE, YandexAuthButton } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { AuthInput } from "@/components/ui/auth-input";
import { ACCENT, ACCENT_FILL_LIGHT, RED } from "@/lib/colors";

export default function LoginPage() {
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
    <AuthShell>
      <h2 className="text-center text-2xl font-semibold leading-none text-white md:text-4xl md:font-bold">
        Привет! <span aria-hidden>👋</span>
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
          placeholder="Логин"
          controlClassName="h-[50px] md:h-10"
        />
        <AuthInput
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Пароль"
          controlClassName="h-[50px] md:h-10"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              setError("Грустно, конечно, но пока эта кнопка не работает 😉");
            }}
            className="cursor-pointer text-[13px] font-medium"
            style={{ color: ACCENT }}
          >
            Забыли пароль?
          </button>
        </div>
        <Button
          variant="authPrimary"
          className="h-[50px] w-full rounded-[10px] border-0 text-base font-medium md:h-12 md:font-bold"
          style={AUTH_PRIMARY_STYLE}
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Вход..." : "Войти"}
        </Button>
      </form>

      <AuthTextLink href="/register" muted="Нет аккаунта?" label="Зарегистрируйтесь" />
      <YandexAuthButton onClick={() => signIn("yandex", { callbackUrl: "/dashboard" })} />
    </AuthShell>
  );
}
