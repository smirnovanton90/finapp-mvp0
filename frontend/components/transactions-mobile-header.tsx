"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { User } from "lucide-react";
import { fetchUserMe, fetchUserPhotoAsBlob } from "@/lib/api";
import { ACCENT, ACCENT_FILL_LIGHT, ACCENT_FILL_MEDIUM } from "@/lib/colors";

export function TransactionsMobileHeader({
  filtersActive,
  onOpenFilters,
  onAdd,
}: {
  filtersActive: boolean;
  onOpenFilters: () => void;
  onAdd: () => void;
}) {
  const { data: session } = useSession();
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");

  useEffect(() => {
    if (!session) return;
    let active = true;
    let blobUrl: string | null = null;

    const loadProfile = async () => {
      try {
        const profile = await fetchUserMe();
        if (!active) return;
        const name =
          profile.first_name?.trim() ||
          profile.name?.trim().split(/\s+/)[0] ||
          "";
        setFirstName(name);
        if (!profile.photo_url) return;
        if (profile.photo_url.includes("googleusercontent.com")) {
          setUserPhotoUrl(profile.photo_url);
          return;
        }
        blobUrl = await fetchUserPhotoAsBlob();
        if (active) setUserPhotoUrl(blobUrl);
      } catch {
        if (active) setUserPhotoUrl(null);
      }
    };

    loadProfile();
    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [session]);

  const sessionName =
    (session?.user as { name?: string } | undefined)?.name?.trim().split(/\s+/)[0] || "";
  const displayName = firstName || sessionName;
  const avatarLetter = displayName.slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-30 -mx-4 flex items-center gap-3 bg-black px-4 pb-2 pt-4">
      <Link
        href="/cabinet"
        aria-label="Открыть личный кабинет"
        className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[rgba(93,95,215,0.22)] text-base font-semibold text-white"
      >
        {userPhotoUrl ? (
          <img src={userPhotoUrl} alt="" className="h-full w-full object-cover" />
        ) : avatarLetter ? (
          avatarLetter
        ) : (
          <User className="size-5" />
        )}
      </Link>
      <p className="min-w-0 flex-1 truncate text-[22px] font-semibold leading-[26px] tracking-[-0.4px] text-white">
        {displayName || "Профиль"}
      </p>
      <button
        type="button"
        onClick={onOpenFilters}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-[4px] px-3 text-sm font-medium leading-7 text-white/85 active:scale-95"
        style={{ backgroundColor: filtersActive ? ACCENT_FILL_MEDIUM : ACCENT_FILL_LIGHT }}
      >
        Фильтры
      </button>
      <button
        type="button"
        aria-label="Добавить транзакцию"
        onClick={onAdd}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-[4px] text-[22px] font-medium leading-7 text-white/85 active:scale-95"
        style={{ backgroundColor: ACCENT }}
      >
        +
      </button>
    </header>
  );
}
