"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { APP_BG_START } from "@/lib/gradients";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== "loading" && session) {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return (
      <div
        className="relative flex min-h-dvh items-center justify-center overflow-hidden"
        style={{ background: APP_BG_START }}
      >
        <div className="relative text-white/70">Загрузка…</div>
      </div>
    );
  }

  if (session) {
    return null;
  }

  return children;
}  
