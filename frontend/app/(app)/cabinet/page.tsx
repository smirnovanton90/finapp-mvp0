"use client";

import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Upload, CheckCircle2, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField, DateField } from "@/components/ui/form-field";
import { Tooltip } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import {
  fetchUserMe,
  updateUserProfile,
  uploadUserPhoto,
  fetchUserPhotoAsBlob,
  createTelegramLinkCode,
  getTelegramStatus,
  unlinkTelegram,
  resetAllUserData,
  UserProfileUpdate,
  UserMeOut,
  fetchIntegrations,
  createOrGetTbankIntegration,
  type UserIntegrationOut,
} from "@/lib/api";
import { useTheme } from "@/components/theme-provider";
import { useAccountingStart } from "@/components/accounting-start-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RestoreFromBackupModal } from "@/components/restore-from-backup-modal";
import { ImportAccountsOperationsModal } from "@/components/import-accounts-operations-modal";
import { buildExportCsv } from "@/lib/data-export-import";
import {
  MODAL_BG,
  ACTIVE_TEXT_DARK,
  ACTIVE_TEXT_LIGHT,
  PLACEHOLDER_COLOR_DARK,
  TBANK,
} from "@/lib/colors";
import { cn } from "@/lib/utils";

const CABINET_AUTH_PRIMARY_STYLE = {
  "--auth-primary-bg":
    "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
  "--auth-primary-bg-hover":
    "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
} as CSSProperties;

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_PHOTO_DIM = 1024;
const ALLOWED_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];

function formatSize(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} МБ`;
}

function formatShortDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const paddedDay = String(day).padStart(2, "0");
  const paddedMonth = String(month).padStart(2, "0");
  return `${paddedDay}.${paddedMonth}.${year}`;
}

/** Блок-карточка в стиле карточки актива: подложка MODAL_BG */
function CabinetCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-lg overflow-hidden border-0 outline-none ${className ?? ""}`}
      style={{ backgroundColor: MODAL_BG }}
    >
      <div className="p-6">{children}</div>
    </div>
  );
}

export default function CabinetPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const { accountingStartDate, refresh: refreshAccountingStart, setDateSetupComplete } = useAccountingStart();
  const [profile, setProfile] = useState<UserMeOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const [restoreModalOpen, setRestoreModalOpen] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [telegramStatus, setTelegramStatus] = useState<{
    linked: boolean;
    notify_time: string;
    notify_enabled: boolean;
  } | null>(null);
  const [telegramLinkCode, setTelegramLinkCode] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetConfirmStep, setResetConfirmStep] = useState<1 | 2>(1);
  const [resetting, setResetting] = useState(false);

  const [integrations, setIntegrations] = useState<UserIntegrationOut[] | null>(null);
  const [tbankOpening, setTbankOpening] = useState(false);
  const [tbankSetupOpen, setTbankSetupOpen] = useState(false);
  const [tbankIntegrationId, setTbankIntegrationId] = useState<number | null>(null);

  useEffect(() => {
    loadProfile();
    loadTelegramStatus();
  }, []);

  useEffect(() => {
    fetchIntegrations()
      .then(setIntegrations)
      .catch(() => setIntegrations([]));
  }, []);

  const loadTelegramStatus = async () => {
    try {
      const s = await getTelegramStatus();
      setTelegramStatus({
        linked: s.linked,
        notify_time: s.notify_time,
        notify_enabled: s.notify_enabled,
      });
    } catch {
      setTelegramStatus(null);
    }
  };

  const handleCreateTelegramCode = async () => {
    setTelegramLoading(true);
    setTelegramLinkCode(null);
    setError(null);
    try {
      const r = await createTelegramLinkCode();
      setTelegramLinkCode(r.code);
      setSuccess("Код создан. Отправьте его боту в течение 10 минут.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!confirm("Отвязать Telegram? Уведомления будут отключены.")) return;
    setTelegramLoading(true);
    setError(null);
    try {
      await unlinkTelegram();
      setTelegramLinkCode(null);
      setTelegramStatus({ linked: false, notify_time: "08:00", notify_enabled: true });
      setSuccess("Telegram отвязан.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setTelegramLoading(false);
    }
  };

  const openResetConfirm = () => {
    setResetConfirmStep(1);
    setResetConfirmOpen(true);
    setError(null);
  };

  const handleResetConfirmStep1 = () => {
    setResetConfirmStep(2);
  };

  const handleResetConfirmStep2 = async () => {
    setResetting(true);
    setError(null);
    try {
      await resetAllUserData();
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem("finapp-date-setup-complete");
      }
      setDateSetupComplete(false);
      await refreshAccountingStart();
      setResetConfirmOpen(false);
      setResetConfirmStep(1);
      setProfile(null);
      loadProfile();
      loadTelegramStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сброса данных.");
    } finally {
      setResetting(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    setError(null);
    try {
      const { csv, filename } = await buildExportCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess("Данные экспортированы.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка экспорта.");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const getProfilePhotoPreview = () =>
    profile?.photo_url && profile.photo_url.startsWith("http") && !profile.photo_url.includes("googleusercontent.com")
      ? null
      : profile?.photo_url ?? null;

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await fetchUserMe();
      setProfile(me);
      setFirstName(me.first_name || "");
      setLastName(me.last_name || "");
      setBirthDate(me.birth_date || "");
      if (!photoPreview?.startsWith("blob:")) {
        if (me.photo_url && me.photo_url.startsWith("http") && !me.photo_url.includes("googleusercontent.com")) {
          const blobUrl = await fetchUserPhotoAsBlob();
          if (blobUrl) setPhotoPreview(blobUrl);
          else setPhotoPreview(null);
        } else {
          setPhotoPreview(me.photo_url || null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить профиль.");
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoChange = (file: File | null) => {
    setPhotoError(null);
    if (photoPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreview);
    }
    if (!file) {
      setPhotoFile(null);
      if (profile?.photo_url && !profile.photo_url.includes("googleusercontent.com")) {
        fetchUserPhotoAsBlob().then((blobUrl) => {
          setPhotoPreview(blobUrl ?? null);
        });
      } else {
        setPhotoPreview(getProfilePhotoPreview());
      }
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError("Разрешены PNG, JPG или WEBP.");
      setPhotoFile(null);
      setPhotoPreview(getProfilePhotoPreview());
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(`Размер фотографии не больше ${formatSize(MAX_PHOTO_BYTES)}.`);
      setPhotoFile(null);
      setPhotoPreview(getProfilePhotoPreview());
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.width > MAX_PHOTO_DIM || image.height > MAX_PHOTO_DIM) {
        setPhotoError(`Разрешение не больше ${MAX_PHOTO_DIM}px.`);
        URL.revokeObjectURL(objectUrl);
        setPhotoFile(null);
        setPhotoPreview(getProfilePhotoPreview());
        return;
      }
      setPhotoFile(file);
      setPhotoPreview(objectUrl);
    };
    image.onerror = () => {
      setPhotoError("Неверный формат изображения.");
      URL.revokeObjectURL(objectUrl);
      setPhotoFile(null);
      setPhotoPreview(getProfilePhotoPreview());
    };
    image.src = objectUrl;
  };

  const uploadPhotoFile = useCallback(async (file: File) => {
    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const updated = await uploadUserPhoto(file);
      setPhotoFile(null);
      setProfile(updated);
      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
      const blobUrl = await fetchUserPhotoAsBlob();
      setPhotoPreview(blobUrl ?? null);
      setSuccess("Фотография успешно загружена.");
      setTimeout(() => setSuccess(null), 3000);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("user-photo-updated"));
      }
      if (photoInputRef.current) photoInputRef.current.value = "";
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Не удалось загрузить фотографию.");
    } finally {
      setUploadingPhoto(false);
    }
  }, [photoPreview]);

  useEffect(() => {
    if (!photoFile) return;
    uploadPhotoFile(photoFile);
  }, [photoFile, uploadPhotoFile]);

  const saveProfileRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PROFILE_DEBOUNCE_MS = 600;

  useEffect(() => {
    if (!profile) return;
    const fn = firstName.trim() || null;
    const ln = lastName.trim() || null;
    const bd = birthDate || null;
    if (fn === (profile.first_name ?? null) && ln === (profile.last_name ?? null) && bd === (profile.birth_date ?? null)) {
      return;
    }
    if (!firstName.trim()) return;

    if (saveProfileRef.current) clearTimeout(saveProfileRef.current);
    saveProfileRef.current = setTimeout(() => {
      saveProfileRef.current = null;
      setSaving(true);
      setError(null);
      setSuccess(null);
      const payload: UserProfileUpdate = {
        first_name: fn || null,
        last_name: ln || null,
        birth_date: bd || null,
      };
      updateUserProfile(payload)
        .then((updated) => {
          setProfile(updated);
          setFirstName(updated.first_name ?? "");
          setLastName(updated.last_name ?? "");
          setBirthDate(updated.birth_date ?? "");
          setSuccess("Профиль сохранён.");
          setTimeout(() => setSuccess(null), 3000);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Не удалось обновить профиль.");
        })
        .finally(() => setSaving(false));
    }, PROFILE_DEBOUNCE_MS);

    return () => {
      if (saveProfileRef.current) {
        clearTimeout(saveProfileRef.current);
        saveProfileRef.current = null;
      }
    };
  }, [firstName, lastName, birthDate, profile]);

  const photoUrl = photoPreview;

  const tbankRow = integrations?.find((i) => i.provider === "TBANK_INVEST");
  const tbankInvestConnected =
    integrations !== null &&
    Boolean(tbankRow?.tbank_wizard_import_completed_at);
  const tbankBlockTitleColor = tbankInvestConnected
    ? ACTIVE_TEXT_LIGHT
    : ACTIVE_TEXT_DARK;

  return (
    <main className="min-h-screen px-8 py-8">
      <div
        className="flex w-full flex-col gap-6"
        style={{
          opacity: loading ? 0 : 1,
          transition: "opacity 0.3s ease-in-out",
        }}
      >
        {(error || success) && (
          <div className="space-y-3">
            {error && (
              <div
                className="text-sm rounded-md border p-3"
                style={{
                  color: "#FB4C4F",
                  backgroundColor: "rgba(251, 76, 79, 0.08)",
                  borderColor: "rgba(251, 76, 79, 0.3)",
                }}
              >
                {error}
              </div>
            )}
            {success && (
              <div
                className="text-sm rounded-md border p-3"
                style={{
                  color: "#34D399",
                  backgroundColor: "rgba(52, 211, 153, 0.08)",
                  borderColor: "rgba(52, 211, 153, 0.3)",
                }}
              >
                {success}
              </div>
            )}
          </div>
        )}

        {/* Профиль — как карточка актива */}
        <CabinetCard>
          <h3
            className="text-2xl font-medium mb-3 flex items-center gap-2"
            style={{ color: ACTIVE_TEXT_DARK }}
          >
            Профиль
            {profile?.google_sub && (
              <Tooltip content="Профиль синхронизирован с Google аккаунтом">
                <CheckCircle2
                  className="w-5 h-5 shrink-0"
                  style={{ color: PLACEHOLDER_COLOR_DARK }}
                />
              </Tooltip>
            )}
          </h3>
          <div className="flex items-start gap-6">
            {/* Фото — как в модалке добавления актива */}
            <div className="relative flex-shrink-0">
              <div
                className="relative w-[200px] h-[200px] rounded-lg overflow-hidden cursor-pointer transition-all group"
                onClick={() => !uploadingPhoto && photoInputRef.current?.click()}
              >
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt="Фото профиля"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor: "rgba(93,95,215,0.22)" }}
                  >
                    <Camera
                      className="w-12 h-12"
                      style={{ color: PLACEHOLDER_COLOR_DARK }}
                    />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <Upload className="w-8 h-8 text-white" />
                </div>
                {uploadingPhoto && (
                  <div
                    className="absolute inset-0 flex items-center justify-center rounded-lg pointer-events-none"
                    style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
                  >
                    <span className="text-sm text-white">Загрузка...</span>
                  </div>
                )}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept={ALLOWED_PHOTO_TYPES.join(",")}
                className="hidden"
                onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
              />
              {photoError && (
                <p className="text-xs mt-1" style={{ color: "#FB4C4F" }}>
                  {photoError}
                </p>
              )}
            </div>

            <div className="flex-1 grid gap-4 min-w-0">
              {saving && (
                <p className="text-xs" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                  Сохранение...
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Имя"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
                <TextField
                  label="Фамилия"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <DateField
                label="Дата рождения"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>
          </div>
        </CabinetCard>

        {/* Настройки */}
        <CabinetCard>
          <div className="space-y-4">
            <h3
              className="text-2xl font-medium"
              style={{ color: ACTIVE_TEXT_DARK }}
            >
              Настройки
            </h3>
            <div className="flex items-center justify-between">
              <label
                className="text-base"
                style={{ color: ACTIVE_TEXT_DARK }}
              >
                Темная тема
              </label>
              <Switch
                checked={theme === "dark"}
                disabled={theme === "dark"}
                onCheckedChange={(checked) => {
                  setTheme(checked ? "dark" : "light");
                }}
              />
            </div>
          </div>
        </CabinetCard>

        {/* Интеграции */}
        <CabinetCard>
          <div className="space-y-4">
            <h3
              className="text-2xl font-medium"
              style={{ color: ACTIVE_TEXT_DARK }}
            >
              Интеграции
            </h3>
            <div
              className={cn(
                "flex flex-col gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                !tbankInvestConnected && "border-2 border-solid"
              )}
              style={
                tbankInvestConnected
                  ? { backgroundColor: TBANK }
                  : { borderColor: TBANK, backgroundColor: "transparent" }
              }
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p
                  className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl"
                  style={{ color: tbankBlockTitleColor }}
                >
                  Т-Инвестиции
                </p>
                {tbankInvestConnected && (
                  <div
                    className="flex items-center gap-1.5 text-sm font-normal"
                    style={{ color: ACTIVE_TEXT_LIGHT }}
                  >
                    <CircleCheck className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                    <span>Подключено</span>
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-col items-stretch justify-center sm:shrink-0 sm:items-end">
                {integrations === null ? (
                  <p
                    className="text-sm font-medium sm:text-right"
                    style={{ color: ACTIVE_TEXT_DARK }}
                  >
                    Загрузка…
                  </p>
                ) : tbankInvestConnected && tbankRow ? (
                  <Button
                    asChild
                    variant="authPrimary"
                    className="w-full rounded-lg border-0 text-sm sm:w-auto"
                    style={CABINET_AUTH_PRIMARY_STYLE}
                  >
                    <Link href={`/cabinet/integrations/${tbankRow.id}`}>
                      Настроить Т-Инвестиции
                    </Link>
                  </Button>
                ) : tbankRow ? (
                  <Button
                    type="button"
                    variant="authPrimary"
                    className="w-full rounded-lg border-0 text-sm sm:w-auto"
                    style={CABINET_AUTH_PRIMARY_STYLE}
                    onClick={() => {
                      setTbankIntegrationId(tbankRow.id);
                      setTbankSetupOpen(true);
                    }}
                  >
                    Продолжить подключение
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="authPrimary"
                    disabled={tbankOpening}
                    className="w-full rounded-lg border-0 text-sm sm:w-auto"
                    style={CABINET_AUTH_PRIMARY_STYLE}
                    onClick={async () => {
                      setTbankOpening(true);
                      setError(null);
                      try {
                        const row = await createOrGetTbankIntegration(false);
                        setIntegrations((prev) => {
                          const list = prev ?? [];
                          if (list.some((x) => x.id === row.id)) return list;
                          return [...list, row];
                        });
                        setTbankIntegrationId(row.id);
                        setTbankSetupOpen(true);
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Не удалось открыть интеграцию."
                        );
                      } finally {
                        setTbankOpening(false);
                      }
                    }}
                  >
                    {tbankOpening ? "Открытие…" : "Подключить Т-Инвестиции"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CabinetCard>

        {tbankIntegrationId != null && (
          <ImportAccountsOperationsModal
            open={tbankSetupOpen}
            onOpenChange={setTbankSetupOpen}
            importSource="tbank_invest_api"
            tbankIntegrationId={tbankIntegrationId}
            onFinish={() => {
              setTbankSetupOpen(false);
              void fetchIntegrations()
                .then(setIntegrations)
                .catch(() => {});
              router.push(`/cabinet/integrations/${tbankIntegrationId}`);
            }}
          />
        )}

        {/* Telegram */}
        <CabinetCard>
          <div className="space-y-4">
            <h3
              className="text-2xl font-medium"
              style={{ color: ACTIVE_TEXT_DARK }}
            >
              Telegram
            </h3>
            <p
              className="text-sm"
              style={{ color: PLACEHOLDER_COLOR_DARK }}
            >
              Уведомления о плановых и просроченных транзакциях. Отправка ошибок в тикет-систему.
            </p>
            {telegramStatus?.linked ? (
              <div className="space-y-2">
                <div
                  className="text-sm rounded-md border p-3"
                  style={{
                    color: "#34D399",
                    backgroundColor: "rgba(52, 211, 153, 0.08)",
                    borderColor: "rgba(52, 211, 153, 0.3)",
                  }}
                >
                  Подключено. Уведомления в {telegramStatus.notify_time}.
                </div>
                <Button
                  type="button"
                  variant="glass"
                  size="sm"
                  className="rounded-lg"
                  style={{
                    "--glass-bg": "rgba(239, 68, 68, 0.15)",
                    "--glass-bg-hover": "rgba(239, 68, 68, 0.3)",
                  } as React.CSSProperties}
                  onClick={handleUnlinkTelegram}
                  disabled={telegramLoading}
                >
                  Отвязать
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {telegramLinkCode ? (
                  <div className="space-y-2">
                    <p
                      className="text-sm"
                      style={{ color: ACTIVE_TEXT_DARK }}
                    >
                      Отправьте боту в Telegram:
                    </p>
                    <code
                      className="block text-xl font-mono p-3 rounded-lg"
                      style={{
                        backgroundColor: "rgba(108, 93, 215, 0.2)",
                        color: ACTIVE_TEXT_DARK,
                      }}
                    >
                      /start {telegramLinkCode}
                    </code>
                    <p
                      className="text-xs"
                      style={{ color: PLACEHOLDER_COLOR_DARK }}
                    >
                      Код действителен 10 минут. После привязки обновите страницу.
                      {typeof process !== "undefined" &&
                        process.env?.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME && (
                          <>
                            {" "}
                            <a
                              href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME.replace(/^@/, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              Открыть бота
                            </a>
                          </>
                        )}
                    </p>
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="authPrimary"
                  size="sm"
                  className="rounded-lg border-0"
                  style={
                    {
                      "--auth-primary-bg":
                        "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                      "--auth-primary-bg-hover":
                        "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                    } as React.CSSProperties
                  }
                  onClick={handleCreateTelegramCode}
                  disabled={telegramLoading}
                >
                  {telegramLoading ? "Создание..." : "Подключить Telegram"}
                </Button>
              </div>
            )}
          </div>
        </CabinetCard>

        {/* Данные: экспорт, импорт из файла, импорт из других приложений */}
        <CabinetCard>
          <div className="space-y-4">
            <h3
              className="text-2xl font-medium"
              style={{ color: ACTIVE_TEXT_DARK }}
            >
              Данные
            </h3>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="authPrimary"
                className="rounded-lg border-0"
                disabled={exporting}
                style={
                  {
                    "--auth-primary-bg":
                      "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                    "--auth-primary-bg-hover":
                      "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                  } as React.CSSProperties
                }
                onClick={handleExportData}
              >
                {exporting ? "Экспорт..." : "Экспорт данных"}
              </Button>
              <Button
                variant="authPrimary"
                className="rounded-lg border-0"
                style={
                  {
                    "--auth-primary-bg":
                      "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                    "--auth-primary-bg-hover":
                      "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                  } as React.CSSProperties
                }
                onClick={() => setRestoreModalOpen(true)}
              >
                Восстановление из резервной копии
              </Button>
              <Button
                type="button"
                variant="glass"
                className="rounded-lg border-0 ml-auto"
                style={
                  {
                    "--glass-bg": "rgba(239, 68, 68, 0.2)",
                    "--glass-bg-hover": "rgba(239, 68, 68, 0.4)",
                    color: "#EF4444",
                  } as React.CSSProperties
                }
                onClick={openResetConfirm}
              >
                Начать сначала
              </Button>
            </div>
          </div>
        </CabinetCard>

        {/* Подтверждение сброса данных: 2 шага */}
        <Dialog open={resetConfirmOpen} onOpenChange={(open) => { if (!resetting) { setResetConfirmOpen(open); if (!open) setResetConfirmStep(1); } }}>
          <DialogContent
            showCloseButton={!resetting}
            title={resetConfirmStep === 1 ? "Начать сначала?" : "Подтвердите ещё раз"}
            className={cn("border-0 rounded-[9px] max-w-md")}
            style={{ backgroundColor: MODAL_BG }}
          >
            <div className="space-y-4" style={{ color: ACTIVE_TEXT_DARK }}>
              {resetConfirmStep === 1 ? (
                <>
                  <p className="text-sm">
                    Будут безвозвратно удалены все ваши данные: активы и обязательства, транзакции и цепочки,
                    добавленные контрагенты и категории, изменения контрагентов и категорий, загруженные картинки,
                    подключение Telegram, дата начала учета. Вы вернётесь к окну онбординга.
                  </p>
                  <p className="text-sm font-medium" style={{ color: "#FB4C4F" }}>
                    Продолжить?
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm">
                    Для окончательного подтверждения нажмите «Начать сначала» ещё раз.
                  </p>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4">
              {resetConfirmStep === 1 ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-lg"
                    onClick={() => setResetConfirmOpen(false)}
                    disabled={resetting}
                  >
                    Отмена
                  </Button>
                  <Button
                    type="button"
                    className="rounded-lg border-0"
                    style={{
                      backgroundColor: "rgba(239, 68, 68, 0.2)",
                      color: "#EF4444",
                    }}
                    onClick={handleResetConfirmStep1}
                  >
                    Продолжить
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-lg"
                    onClick={() => setResetConfirmStep(1)}
                    disabled={resetting}
                  >
                    Назад
                  </Button>
                  <Button
                    type="button"
                    className="rounded-lg border-0"
                    style={{
                      backgroundColor: "#EF4444",
                      color: "#fff",
                    }}
                    onClick={handleResetConfirmStep2}
                    disabled={resetting}
                  >
                    {resetting ? "Сброс..." : "Начать сначала"}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <RestoreFromBackupModal
          open={restoreModalOpen}
          onOpenChange={setRestoreModalOpen}
          onSuccess={async () => {
            setDateSetupComplete(true);
            await refreshAccountingStart();
            setProfile(null);
            loadProfile();
            loadTelegramStatus();
          }}
        />

        {/* Информация */}
        {accountingStartDate && (
          <CabinetCard>
            <h3
              className="text-2xl font-medium mb-3"
              style={{ color: ACTIVE_TEXT_DARK }}
            >
              Информация
            </h3>
            <div>
              <div
                className="text-sm font-normal"
                style={{ color: PLACEHOLDER_COLOR_DARK }}
              >
                Дата начала учета
              </div>
              <p
                className="text-lg font-normal mt-2"
                style={{ color: ACTIVE_TEXT_DARK }}
              >
                {formatShortDate(accountingStartDate)}
              </p>
            </div>
          </CabinetCard>
        )}
      </div>

    </main>
  );
}
