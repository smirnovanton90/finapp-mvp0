"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
  Wallet,
  ArrowLeftRight,
  LineChart,
  BarChart3,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  LayoutDashboard,
  Folder,
  Gauge,
  Users,
  User,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useSidebar } from "./sidebar-context";
import { fetchUserMe, fetchUserPhotoAsBlob } from "@/lib/api";
import { SIDEBAR_TEXT_ACTIVE, SIDEBAR_TEXT_INACTIVE } from "@/lib/colors";

const nav = [
  { href: "/dashboard", label: "\u0414\u044d\u0448\u0431\u043e\u0440\u0434", icon: LayoutDashboard },
  {
    href: "/assets",
    label: "\u0410\u043a\u0442\u0438\u0432\u044b \u0438 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u0441\u0442\u0432\u0430",
    icon: Wallet,
  },
  {
    href: "/transactions",
    label: "\u0422\u0440\u0430\u043d\u0437\u0430\u043a\u0446\u0438\u0438",
    icon: ArrowLeftRight,
  },
  {
    href: "/financial-planning",
    label: "\u041f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435",
    icon: LineChart,
  },
  {
    href: "/limits",
    label: "\u041b\u0438\u043c\u0438\u0442\u044b",
    icon: Gauge,
  },
  {
    href: "/categories",
    label: "\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438",
    icon: Folder,
  },
  {
    href: "/counterparties",
    label: "\u041a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u044b",
    icon: Users,
  },
  {
    href: "/reports",
    label: "\u041e\u0442\u0447\u0435\u0442\u044b",
    icon: BarChart3,
    children: [
      {
        href: "/reports/assets-dynamics",
        label: "\u0414\u0438\u043d\u0430\u043c\u0438\u043a\u0430 \u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u0438 \u0430\u043a\u0442\u0438\u0432\u043e\u0432",
      },
      {
        href: "/reports/income-expense-dynamics",
        label:
          "\u0414\u0438\u043d\u0430\u043c\u0438\u043a\u0430 \u0434\u043e\u0445\u043e\u0434\u043e\u0432 \u0438 \u0440\u0430\u0441\u0445\u043e\u0434\u043e\u0432 \u043f\u043e \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f\u043c",
      },
    ],
  },
];

function IconFrame({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center">{children}</span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);
  const isCabinetActive = pathname === "/cabinet" || pathname.startsWith("/cabinet/");

  // Загрузка фото пользователя
  useEffect(() => {
    let blobUrl: string | null = null;
    const loadUserPhoto = async () => {
      try {
        const me = await fetchUserMe();
        if (me.photo_url) {
          // Если это URL из Google, используем напрямую
          if (me.photo_url.includes("googleusercontent.com")) {
            setUserPhotoUrl(me.photo_url);
          } else {
            // Иначе загружаем через API с авторизацией
            const blob = await fetchUserPhotoAsBlob();
            if (blob) {
              blobUrl = blob;
              setUserPhotoUrl(blob);
            } else {
              setUserPhotoUrl(null);
            }
          }
        } else {
          setUserPhotoUrl(null);
        }
      } catch {
        setUserPhotoUrl(null);
      }
    };

    loadUserPhoto();

    // Очистка blob URL при размонтировании
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, []);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen p-[10px] transition-[width] duration-300",
        isCollapsed ? "w-[100px]" : "w-[300px]"
      )}
    >
      <div className="flex h-full w-full flex-col rounded-[9px] bg-sidebar">
        {/* Collapse toggle */}
        <div className="relative h-[55px]">
          <Button
            variant="glass"
            onClick={toggleSidebar}
            className={cn(
              "absolute top-[10px] h-[35px] w-[35px] rounded-[9px] p-0",
              isCollapsed ? "left-1/2 -translate-x-1/2" : "right-[10px]"
            )}
            style={
              {
                "--glass-bg": "rgba(108, 93, 215, 0.22)",
                "--glass-bg-hover": "rgba(108, 93, 215, 0.32)",
              } as CSSProperties
            }
            aria-label={isCollapsed ? "Развернуть меню" : "Свернуть меню"}
          >
            {isCollapsed ? (
              <IconFrame>
                <ArrowRight
                  className="size-[15px]"
                  strokeWidth={1.5}
                  style={{ color: SIDEBAR_TEXT_INACTIVE }}
                />
              </IconFrame>
            ) : (
              <IconFrame>
                <ArrowLeft
                  className="size-[15px]"
                  strokeWidth={1.5}
                  style={{ color: SIDEBAR_TEXT_INACTIVE }}
                />
              </IconFrame>
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="mt-[10px] flex flex-1 flex-col gap-[10px] overflow-y-auto pb-[10px]">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            const variant = active ? "authPrimary" : "glass";
            const buttonStyle = (active
              ? ({
                  "--auth-primary-bg":
                    "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                  "--auth-primary-bg-hover":
                    "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                } as CSSProperties)
              : ({
                  "--glass-bg": "rgba(108, 93, 215, 0)",
                  "--glass-bg-hover": "rgba(108, 93, 215, 0.22)",
                } as CSSProperties));

            const itemColor = active ? SIDEBAR_TEXT_ACTIVE : SIDEBAR_TEXT_INACTIVE;

            const commonClass = cn(
              "mx-[10px] h-[50px] w-[calc(100%-20px)] justify-start pl-[15px] pr-[15px] text-left",
              "rounded-[9px] text-base font-normal min-w-0",
              isCollapsed && "mx-auto h-[50px] w-[60px] justify-center px-0"
            );

            // Все пункты, включая "Отчеты", ведут на свою страницу (без раскрытия в сайдбаре)
            const content = (
              <Button
                asChild
                variant={variant as "glass" | "authPrimary"}
                className={commonClass}
                style={buttonStyle}
              >
                <Link href={item.href}>
                  <IconFrame>
                    <Icon
                      className="size-[30px]"
                      strokeWidth={1.5}
                      style={{ color: itemColor }}
                    />
                  </IconFrame>
                  {!isCollapsed && (
                    <span
                      className="ml-[10px] flex-1 truncate"
                      style={{ color: itemColor }}
                    >
                      {item.label}
                    </span>
                  )}
                </Link>
              </Button>
            );

            return isCollapsed ? (
              <Tooltip key={item.href} content={item.label} side="right" className="flex w-full">
                {content}
              </Tooltip>
            ) : (
              <div key={item.href}>{content}</div>
            );
          })}
        </nav>

        {/* Footer (profile + logout) */}
        <div className="pb-[10px]">
          <div className="flex flex-col gap-[10px]">
            {/* Личный кабинет */}
            {isCollapsed ? (
              <Tooltip content="Личный кабинет" side="right" className="flex w-full">
                <Button
                  variant={isCabinetActive ? "authPrimary" : "glass"}
                  className="mx-auto h-[50px] w-[60px] rounded-[9px] p-0"
                  style={
                    (isCabinetActive
                      ? ({
                          "--auth-primary-bg":
                            "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                          "--auth-primary-bg-hover":
                            "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                        } as CSSProperties)
                      : ({
                          "--glass-bg": "rgba(108, 93, 215, 0.22)",
                          "--glass-bg-hover": "rgba(108, 93, 215, 0.32)",
                        } as CSSProperties))
                  }
                  onClick={() => router.push("/cabinet")}
                >
                  {userPhotoUrl ? (
                    <IconFrame>
                      <img
                        src={userPhotoUrl}
                        alt="Фото профиля"
                        className="h-[30px] w-[30px] shrink-0 rounded-full object-cover"
                      />
                    </IconFrame>
                  ) : (
                    <IconFrame>
                      <User
                        className="size-[30px]"
                        strokeWidth={1.5}
                        style={{ color: SIDEBAR_TEXT_ACTIVE }}
                      />
                    </IconFrame>
                  )}
                </Button>
              </Tooltip>
            ) : (
              <Button
                variant={isCabinetActive ? "authPrimary" : "glass"}
                className="mx-[10px] h-[50px] w-[calc(100%-20px)] justify-start rounded-[9px] pl-[15px] pr-[15px]"
                style={
                  (isCabinetActive
                    ? ({
                        "--auth-primary-bg":
                          "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                        "--auth-primary-bg-hover":
                          "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                      } as CSSProperties)
                    : ({
                        "--glass-bg": "rgba(108, 93, 215, 0.22)",
                        "--glass-bg-hover": "rgba(108, 93, 215, 0.32)",
                      } as CSSProperties))
                }
                onClick={() => router.push("/cabinet")}
              >
                <div className="flex w-full items-center gap-[10px] min-w-0">
                  {userPhotoUrl ? (
                    <IconFrame>
                      <img
                        src={userPhotoUrl}
                        alt="Фото профиля"
                        className="h-[30px] w-[30px] shrink-0 rounded-full object-cover"
                      />
                    </IconFrame>
                  ) : (
                    <IconFrame>
                      <User
                        className="size-[30px]"
                        strokeWidth={1.5}
                        style={{ color: SIDEBAR_TEXT_ACTIVE }}
                      />
                    </IconFrame>
                  )}
                  <span
                    className="flex-1 truncate text-base font-normal"
                    style={{ color: SIDEBAR_TEXT_ACTIVE }}
                  >
                    Личный кабинет
                  </span>
                </div>
              </Button>
            )}

            {/* Выйти */}
            {isCollapsed ? (
              <Tooltip content="Выйти" side="right" className="flex w-full">
                <Button
                  variant="glass"
                  className="mx-auto h-[50px] w-[60px] rounded-[9px] p-0"
                  style={
                    {
                      "--glass-bg": "rgba(215, 93, 172, 0.22)",
                      "--glass-bg-hover": "rgba(215, 93, 172, 0.32)",
                    } as CSSProperties
                  }
                  onClick={() => signOut()}
                >
                  <IconFrame>
                    <LogOut
                      className="size-[30px]"
                      strokeWidth={1.5}
                      style={{ color: SIDEBAR_TEXT_ACTIVE }}
                    />
                  </IconFrame>
                </Button>
              </Tooltip>
            ) : (
              <Button
                variant="glass"
                className="mx-[10px] h-[50px] w-[calc(100%-20px)] justify-start rounded-[9px] pl-[15px] pr-[15px]"
                style={
                  {
                    "--glass-bg": "rgba(215, 93, 172, 0.22)",
                    "--glass-bg-hover": "rgba(215, 93, 172, 0.32)",
                  } as CSSProperties
                }
                onClick={() => signOut()}
              >
                <div className="flex w-full items-center gap-[10px] min-w-0">
                  <IconFrame>
                    <LogOut
                      className="size-[30px]"
                      strokeWidth={1.5}
                      style={{ color: SIDEBAR_TEXT_ACTIVE }}
                    />
                  </IconFrame>
                  <span
                    className="flex-1 truncate text-base font-normal"
                    style={{ color: SIDEBAR_TEXT_ACTIVE }}
                  >
                    Выйти
                  </span>
                </div>
              </Button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
