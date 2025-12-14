"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Wallet, ArrowLeftRight } from "lucide-react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/assets", label: "Активы и обязательства", icon: Wallet },
  { href: "/transactions", label: "Транзакции", icon: ArrowLeftRight },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-72 flex-col border-r bg-white">
       <div className="flex h-16 items-center px-6">
         <div className="text-sm font-semibold">FinApp</div>
       </div>

        <nav className="flex-1 px-3">
            {nav.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;

                return (
                <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                    "mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                        ? "bg-violet-50 text-violet-700"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                >
                    <Icon className={cn("h-4 w-4", active ? "text-violet-700" : "")} />
                    {item.label}
                </Link>
                );
            })}
        </nav>
        <div className="border-t p-3">
            <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => signOut()}
            >
                <LogOut className="h-4 w-4" />
                Выйти
            </Button>
        </div>
    </aside>
  );
}
