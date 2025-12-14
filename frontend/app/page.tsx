"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export default function Home() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <main style={{ padding: 24 }}>Загрузка… ☕</main>;
  }

  if (!session) {
    return (
      <main style={{ padding: 24 }}>
        <h1>FinApp MVP0</h1>
        <p>Ты не залогинен. Нажми кнопку — и Google откроет портал.</p>
        <button
          onClick={() => signIn("google")}
          style={{ padding: "10px 16px", marginTop: 12 }}
        >
          Войти через Google
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Привет, {session.user?.name || "инкогнито"} 👋</h1>
      <p>Добро пожаловать в прототип. Тут пока минимум фич, максимум вайба.</p>
      <button
        onClick={() => signOut()}
        style={{ padding: "10px 16px", marginTop: 12 }}
      >
        Выйти
      </button>
    </main>
  );
}