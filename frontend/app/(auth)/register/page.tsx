"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

async function readError(res: Response) {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
  } catch {
    // ignore parse errors
  }
  return res.statusText || "Request failed";
}

export default function RegisterPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }),
    });

    if (!response.ok) {
      setError(await readError(response));
      setIsSubmitting(false);
      return;
    }

    const signInResult = await signIn("credentials", {
      redirect: false,
      login,
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
    <main className="flex min-h-screen items-center justify-center bg-[#F7F8FA] px-6">
      <Card className="w-[360px]">
        <CardHeader>
          <CardTitle>Регистрация</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Логин</label>
              <Input
                autoComplete="username"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                placeholder="Придумайте логин"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Пароль</label>
              <Input
                autoComplete="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Придумайте пароль"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button className="w-full" type="submit" disabled={isSubmitting}>
              Зарегистрироваться
            </Button>
          </form>
          <Button className="w-full" variant="ghost" asChild>
            <Link href="/login">Есть аккаунт? Войти</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
