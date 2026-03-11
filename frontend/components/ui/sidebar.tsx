"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
  Wallet,
  ArrowLeftRight,
  LineChart,
  BarChart3,
  ArrowLeft,
  ArrowRight,
  LayoutDashboard,
  Folder,
  Gauge,
  Users,
  User,
  Filter,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip } from "@/components/ui/tooltip";
import { useSidebar } from "./sidebar-context";
import { fetchUserMe, fetchUserPhotoAsBlob } from "@/lib/api";
import { ACTIVE_TEXT_DARK, MODAL_BG, SIDEBAR_BG, SIDEBAR_TEXT_ACTIVE, SIDEBAR_TEXT_INACTIVE } from "@/lib/colors";
import { SIDEBAR_FILTERS_SLOT_ID } from "@/lib/sidebar-filters-slot";

const SIDEBAR_BASE_WIDTH = 300;
const FILTER_PANEL_WIDTH = 400;
/** Padding aside: 10px left + 10px right. Учитываем в width, чтобы контент подложки не выезжал за край (box-sizing: border-box). */
const ASIDE_PADDING_H = 20;

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
    href: "/goals",
    label: "Цели",
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
        href: "/reports/income-expense-by-period",
        label: "Доходы/расходы по периодам",
      },
    ],
  },
];

function IconFrame({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center">{children}</span>
  );
}

const FILTER_PAGES = ["/assets", "/transactions", "/financial-planning", "/goals", "/categories", "/counterparties"];

/** Страница детального просмотра актива /assets/[id] — без панели фильтров. */
function isAssetDetailPage(pathname: string): boolean {
  if (!pathname.startsWith("/assets/")) return false;
  const segments = pathname.split("/").filter(Boolean);
  return segments.length === 2;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    isCollapsed,
    toggleSidebar,
    isFilterPanelCollapsed,
    toggleFilterPanel,
    isDesktop,
    mobileOpen,
    setMobileOpen,
  } = useSidebar();
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);
  const userPhotoBlobRef = useRef<string | null>(null);
  const isCabinetActive = pathname === "/cabinet" || pathname.startsWith("/cabinet/");
  const hasFilters =
    !isAssetDetailPage(pathname ?? "") &&
    FILTER_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const showFiltersSection = hasFilters && !isCollapsed;
  const isMobile = !isDesktop;

  // На мобильном фильтры рендерятся в MobileFiltersDrawer, не в сайдбаре
  const renderFilterSlot = hasFilters && isDesktop;

  // Загрузка фото пользователя и обновление при смене в личном кабинете
  useEffect(() => {
    const loadUserPhoto = async () => {
      try {
        const me = await fetchUserMe();
        if (me.photo_url) {
          if (me.photo_url.includes("googleusercontent.com")) {
            if (userPhotoBlobRef.current) {
              URL.revokeObjectURL(userPhotoBlobRef.current);
              userPhotoBlobRef.current = null;
            }
            setUserPhotoUrl(me.photo_url);
          } else {
            const blob = await fetchUserPhotoAsBlob();
            if (blob) {
              if (userPhotoBlobRef.current) {
                URL.revokeObjectURL(userPhotoBlobRef.current);
              }
              userPhotoBlobRef.current = blob;
              setUserPhotoUrl(blob);
            } else {
              userPhotoBlobRef.current = null;
              setUserPhotoUrl(null);
            }
          }
        } else {
          userPhotoBlobRef.current = null;
          setUserPhotoUrl(null);
        }
      } catch {
        userPhotoBlobRef.current = null;
        setUserPhotoUrl(null);
      }
    };

    loadUserPhoto();

    const onPhotoUpdated = () => loadUserPhoto();
    window.addEventListener("user-photo-updated", onPhotoUpdated);

    return () => {
      window.removeEventListener("user-photo-updated", onPhotoUpdated);
      if (userPhotoBlobRef.current) {
        URL.revokeObjectURL(userPhotoBlobRef.current);
        userPhotoBlobRef.current = null;
      }
    };
  }, []);

  const filtersOpen = hasFilters && !isFilterPanelCollapsed;
  const showFilterStrip = hasFilters && isDesktop;
  const unifiedBg = showFiltersSection || (isCollapsed && hasFilters);
  const contentWidth = isCollapsed
    ? hasFilters
      ? 100 + (filtersOpen ? FILTER_PANEL_WIDTH : 0)
      : 100
    : showFiltersSection
      ? SIDEBAR_BASE_WIDTH + (filtersOpen ? FILTER_PANEL_WIDTH : 0)
      : SIDEBAR_BASE_WIDTH;
  const asideWidth = contentWidth + ASIDE_PADDING_H;

  // Мобильный drawer: оверлей + панель слева (только нав + футер, без фильтров)
  if (isMobile) {
    return (
      <>
        <div
          className={cn(
            "fixed inset-0 z-20 bg-black/50 transition-opacity md:hidden",
            mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          aria-hidden
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            "fixed left-0 top-0 z-20 h-screen w-[min(300px,100vw)] max-w-[85vw] p-[10px]",
            "transition-transform duration-300 ease-out md:hidden",
            "flex flex-col rounded-r-[9px] bg-sidebar shadow-xl",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-[55px] items-center justify-end pr-[10px]">
            <IconButton
              onClick={() => setMobileOpen(false)}
              aria-label="Закрыть меню"
              appearance="default"
            >
              <ArrowRight className="size-4" strokeWidth={1.5} style={{ color: SIDEBAR_TEXT_INACTIVE }} />
            </IconButton>
          </div>
          <nav className="scrollbar-dropdown mt-[10px] flex flex-1 flex-col gap-[10px] overflow-y-auto pb-[10px] min-h-0">
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              const itemColor = active ? ACTIVE_TEXT_DARK : SIDEBAR_TEXT_INACTIVE;
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
              return (
                <Button
                  key={item.href}
                  asChild
                  variant={variant as "glass" | "authPrimary"}
                  className="mx-[10px] h-[50px] w-[calc(100%-20px)] justify-start pl-[15px] pr-[15px] rounded-[9px] text-base font-normal min-w-0"
                  style={buttonStyle}
                >
                  <Link href={item.href} onClick={() => setMobileOpen(false)}>
                    <IconFrame>
                      <Icon className="size-[30px]" strokeWidth={1.5} style={{ color: itemColor }} />
                    </IconFrame>
                    <span className="ml-[10px] flex-1 truncate" style={{ color: itemColor }}>
                      {item.label}
                    </span>
                  </Link>
                </Button>
              );
            })}
          </nav>
          <div className="pb-[10px] flex flex-col gap-[10px]">
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
              onClick={() => {
                setMobileOpen(false);
                router.push("/cabinet");
              }}
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
                    <User className="size-[30px]" strokeWidth={1.5} style={{ color: ACTIVE_TEXT_DARK }} />
                  </IconFrame>
                )}
                <span className="flex-1 truncate text-base font-normal" style={{ color: ACTIVE_TEXT_DARK }}>
                  Личный кабинет
                </span>
              </div>
            </Button>
            <Button
              variant="glass"
              className="mx-[10px] h-[50px] w-[calc(100%-20px)] justify-start rounded-[9px] pl-[15px] pr-[15px]"
              style={
                {
                  "--glass-bg": "rgba(215, 93, 172, 0.22)",
                  "--glass-bg-hover": "rgba(215, 93, 172, 0.32)",
                } as CSSProperties
              }
              onClick={() => {
                setMobileOpen(false);
                signOut();
              }}
            >
              <div className="flex w-full items-center gap-[10px] min-w-0">
                <IconFrame>
                  <LogOut className="size-[30px]" strokeWidth={1.5} style={{ color: ACTIVE_TEXT_DARK }} />
                </IconFrame>
                <span className="flex-1 truncate text-base font-normal" style={{ color: ACTIVE_TEXT_DARK }}>
                  Выйти
                </span>
              </div>
            </Button>
          </div>
        </aside>
      </>
    );
  }

  return (
    <aside
      className="fixed left-0 top-0 z-20 h-screen p-[10px] transition-[width] duration-300"
      style={{ width: asideWidth }}
    >
      <div
        className={cn(
          "flex h-full w-full",
          renderFilterSlot && "flex-row gap-0",
          unifiedBg && "rounded-[9px] bg-sidebar"
        )}
      >
        {/* Left part: nav + footer. Подложка только когда нет единой подложки (не на странице с фильтрами или сайдбар развёрнут без фильтров). */}
        <div
          className={cn(
            "flex h-full flex-col shrink-0",
            unifiedBg ? (isCollapsed ? "w-[100px]" : "w-[300px]") : isCollapsed ? "w-[100px] rounded-[9px] bg-sidebar" : "w-full rounded-[9px] bg-sidebar"
          )}
        >
        {/* Кнопки сворачивания сайдбара (слева) и разворота фильтров (справа) — IconButton. На вкладках без фильтра одна кнопка — по центру. */}
        <div
          className={cn(
            "relative h-[55px] flex items-center gap-[10px] pr-[10px]",
            isCollapsed && !showFilterStrip ? "justify-center pr-0" : "justify-end"
          )}
        >
          <Tooltip content={isCollapsed ? "Развернуть меню" : "Свернуть меню"} side="right" className="flex">
            <IconButton
              onClick={toggleSidebar}
              aria-label={isCollapsed ? "Развернуть меню" : "Свернуть меню"}
              appearance={isCollapsed ? "inactive" : "default"}
            >
              {isCollapsed ? (
                <ArrowRight className="size-4" strokeWidth={1.5} style={{ color: SIDEBAR_TEXT_INACTIVE }} />
              ) : (
                <ArrowLeft className="size-4" strokeWidth={1.5} style={{ color: SIDEBAR_TEXT_INACTIVE }} />
              )}
            </IconButton>
          </Tooltip>
          {showFilterStrip && (
            <Tooltip
              content={isFilterPanelCollapsed ? "Развернуть фильтры" : "Свернуть фильтры"}
              side="right"
              className="flex"
            >
              <IconButton
                onClick={toggleFilterPanel}
                aria-expanded={!isFilterPanelCollapsed}
                aria-label={isFilterPanelCollapsed ? "Развернуть фильтры" : "Свернуть фильтры"}
                appearance={isFilterPanelCollapsed ? "inactive" : "default"}
              >
                <Filter
                  className="size-4"
                  strokeWidth={1.5}
                  style={{ color: isFilterPanelCollapsed ? SIDEBAR_TEXT_INACTIVE : ACTIVE_TEXT_DARK }}
                />
              </IconButton>
            </Tooltip>
          )}
        </div>

        {/* Navigation */}
        <nav className="scrollbar-dropdown mt-[10px] flex flex-1 flex-col gap-[10px] overflow-y-auto pb-[10px] min-h-0">
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

            const itemColor = active ? ACTIVE_TEXT_DARK : SIDEBAR_TEXT_INACTIVE;

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
                        style={{ color: ACTIVE_TEXT_DARK }}
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
                        style={{ color: ACTIVE_TEXT_DARK }}
                      />
                    </IconFrame>
                  )}
                  <span
                    className="flex-1 truncate text-base font-normal"
                    style={{ color: ACTIVE_TEXT_DARK }}
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
                      style={{ color: ACTIVE_TEXT_DARK }}
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
                      style={{ color: ACTIVE_TEXT_DARK }}
                    />
                  </IconFrame>
                  <span
                    className="flex-1 truncate text-base font-normal"
                    style={{ color: ACTIVE_TEXT_DARK }}
                  >
                    Выйти
                  </span>
                </div>
              </Button>
            )}
          </div>
        </div>
        </div>

        {/* Панель фильтров справа. Без своей подложки — единая с сайдбаром при showFiltersSection. Слот всегда в DOM при hasFilters. */}
        {renderFilterSlot && (
          <div
            className={cn(
              "h-full shrink-0 flex flex-col overflow-hidden min-h-0 transition-[width] duration-300",
              filtersOpen ? "w-[400px]" : "w-0 min-w-0 overflow-hidden pointer-events-none"
            )}
            aria-hidden={!filtersOpen}
          >
            <div
              id={SIDEBAR_FILTERS_SLOT_ID}
              className="scrollbar-dropdown flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden py-3 px-3"
            />
          </div>
        )}
      </div>
    </aside>
  );
}
