"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginWithPasswordPage() {
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
      setError("Неверный логин или пароль.");
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 relative overflow-hidden">
      {/* Gradient background matching the SVG design */}
      <div 
        className="absolute inset-0"
        style={{
          background: "conic-gradient(from 90deg, rgba(58, 50, 116, 1) 0deg, rgba(108, 93, 215, 1) 17.27deg, rgba(0, 0, 0, 1) 339.49deg, rgba(58, 50, 116, 1) 360deg)",
        }}
      />
      
      <div className="relative z-10 w-full max-w-[360px]">
        <Card className="bg-card/95 backdrop-blur-sm border-2 border-border/50 shadow-2xl">
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-2xl font-bold text-[#CFCFD6]">Вход</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#CFCFD6]">Логин</label>
                <Input
                  className="border-2 border-[#6C5DD7]/30 bg-[#6C5DD7]/22 text-[#CFCFD6] placeholder:text-[#CFCFD6]/60 focus-visible:border-[#6C5DD7] focus-visible:ring-[#6C5DD7]/50"
                  autoComplete="username"
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                  placeholder="Введите логин"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#CFCFD6]">Пароль</label>
                <Input
                  className="border-2 border-[#6C5DD7]/30 bg-[#6C5DD7]/22 text-[#CFCFD6] placeholder:text-[#CFCFD6]/60 focus-visible:border-[#6C5DD7] focus-visible:ring-[#6C5DD7]/50"
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Введите пароль"
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button 
                className="w-full bg-[#6C5DD7] hover:bg-[#5A4BC5] text-white h-12 text-base font-medium shadow-lg" 
                type="submit" 
                disabled={isSubmitting}
              >
                {isSubmitting ? "Вход..." : "Войти"}
              </Button>
            </form>
            <Button 
              className="w-full border-2 border-[#6C5DD7]/30 bg-[#6C5DD7]/22 hover:bg-[#6C5DD7]/35 text-[#CFCFD6] h-12 text-base font-medium shadow-sm" 
              variant="outline" 
              asChild
            >
              <Link href="/register">Зарегистрироваться</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
