"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-[360px]">
        <CardHeader>
          <CardTitle>FinApp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            Войти через Google
          </Button>
          <Button className="w-full border-2 border-border/70 bg-card shadow-none" variant="outline" asChild>
            <Link href="/login/password">Войти с логином и паролем</Link>
          </Button>
          <Button className="w-full border-2 border-border/70 bg-card shadow-none" variant="outline" asChild>
            <Link href="/register">Зарегистрироваться</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
