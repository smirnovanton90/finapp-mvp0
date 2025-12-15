"use client";

import { signIn } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-6">
      <Card className="w-[360px]">
        <CardHeader>
          <CardTitle>FinApp</CardTitle>
        </CardHeader>
        <CardContent>
          <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white" onClick={() => signIn("google", { callbackUrl: "/assets" })}>
            Войти через Google
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}