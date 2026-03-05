"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { Camera, Upload, CheckCircle2 } from "lucide-react";
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
} from "@/lib/api";
import { useTheme } from "@/components/theme-provider";
import { useAccountingStart } from "@/components/accounting-start-context";
import {
  ImportHistoryModalContent,
  type ImportSourceKey,
} from "@/components/import-history-modal-content";
import { ImportAccountsOperationsModal } from "@/components/import-accounts-operations-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  buildExportCsv,
  parseExportCsv,
  runImport,
  type ImportProgress,
  type ParsedExport,
} from "@/lib/data-export-import";
import {
  MODAL_BG,
  ACTIVE_TEXT_DARK,
  PLACEHOLDER_COLOR_DARK,
  ACCENT,
  ACCENT2,
  BACKGROUND_DT,
} from "@/lib/colors";
import { PINK_GRADIENT } from "@/lib/gradients";
import { cn } from "@/lib/utils";

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

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importServiceModalOpen, setImportServiceModalOpen] = useState(false);
  const [importSource, setImportSource] = useState<ImportSourceKey>(null);

  const [importFileModalOpen, setImportFileModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFileDragOver, setImportFileDragOver] = useState(false);
  const [parsedFileData, setParsedFileData] = useState<ParsedExport | null>(null);
  const [parseFileError, setParseFileError] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<{ success: boolean; error?: string; counts?: Record<string, number> } | null>(null);
  const [exporting, setExporting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    loadProfile();
    loadTelegramStatus();
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

  const openImportFileModal = () => {
    setImportFile(null);
    setImportFileDragOver(false);
    setParsedFileData(null);
    setParseFileError(null);
    setImportProgress(null);
    setImportResult(null);
    if (importFileInputRef.current) importFileInputRef.current.value = "";
    setImportFileModalOpen(true);
  };

  const handleImportFileSelect = (file: File | null) => {
    setImportFile(file ?? null);
    setParsedFileData(null);
    setParseFileError(null);
    setImportProgress(null);
    setImportResult(null);
  };

  useEffect(() => {
    if (!importFile) {
      setParsedFileData(null);
      setParseFileError(null);
      return;
    }
    let cancelled = false;
    setIsParsingFile(true);
    setParseFileError(null);
    importFile.text().then(
      (text) => {
        if (cancelled) return;
        try {
          const data = parseExportCsv(text);
          setParsedFileData(data);
        } catch (e) {
          setParseFileError(e instanceof Error ? e.message : "Не удалось прочитать файл.");
        }
      },
      () => {
        if (!cancelled) setParseFileError("Не удалось прочитать файл.");
      }
    ).finally(() => {
      if (!cancelled) setIsParsingFile(false);
    });
    return () => { cancelled = true; };
  }, [importFile]);

  const handleImportFromFile = async () => {
    if (!parsedFileData) return;
    setImportProgress({ stage: "Загрузка файла...", current: 0, total: 1 });
    setImportResult(null);
    try {
      const result = await runImport(parsedFileData, (p) => setImportProgress(p));
      setImportResult({
        success: result.success,
        error: result.error,
        counts: result.counts,
      });
      if (result.success) {
        setSuccess("Данные импортированы.");
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (e) {
      setImportResult({
        success: false,
        error: e instanceof Error ? e.message : "Ошибка импорта.",
      });
    } finally {
      setImportProgress(null);
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

  const handlePhotoUpload = async () => {
    if (!photoFile) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const updated = await uploadUserPhoto(photoFile);
      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
      setPhotoFile(null);
      setProfile(updated);
      const blobUrl = await fetchUserPhotoAsBlob();
      setPhotoPreview(blobUrl ?? null);
      setSuccess("Фотография успешно загружена.");
      setTimeout(() => setSuccess(null), 3000);
      if (photoInputRef.current) photoInputRef.current.value = "";
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Не удалось загрузить фотографию.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: UserProfileUpdate = {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        birth_date: birthDate || null,
      };
      if (!payload.first_name) {
        setError("Имя является обязательным полем.");
        setSaving(false);
        return;
      }
      const updated = await updateUserProfile(payload);
      setProfile(updated);
      setSuccess("Профиль успешно обновлен.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить профиль.");
    } finally {
      setSaving(false);
    }
  };

  const photoUrl = photoPreview;

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
                onClick={() => photoInputRef.current?.click()}
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
              {photoFile && (
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handlePhotoUpload}
                    disabled={uploadingPhoto}
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
                  >
                    {uploadingPhoto ? "Загрузка..." : "Загрузить"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="glass"
                    className="rounded-lg border-0"
                    style={
                      {
                        "--glass-bg": "rgba(108, 93, 215, 0.22)",
                        "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                      } as React.CSSProperties
                    }
                    onClick={() => handlePhotoChange(null)}
                  >
                    Отмена
                  </Button>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="flex-1 grid gap-4 min-w-0">
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
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="submit"
                  variant="authPrimary"
                  disabled={saving}
                  className="rounded-lg border-0"
                  style={
                    {
                      "--auth-primary-bg":
                        "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                      "--auth-primary-bg-hover":
                        "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                    } as React.CSSProperties
                  }
                >
                  {saving ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </form>
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
            <p
              className="text-sm"
              style={{ color: PLACEHOLDER_COLOR_DARK }}
            >
              Экспорт всех ваших данных в CSV и импорт ранее экспортированного файла.
            </p>
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
                {exporting ? "Экспорт..." : "Экспорт данных в CSV"}
              </Button>
              <Button
                variant="glass"
                className="rounded-lg border-0"
                style={
                  {
                    "--glass-bg": "rgba(108, 93, 215, 0.22)",
                    "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                  } as React.CSSProperties
                }
                onClick={openImportFileModal}
              >
                Импорт истории из файла
              </Button>
              <Button
                variant="glass"
                className="rounded-lg border-0"
                style={
                  {
                    "--glass-bg": "rgba(108, 93, 215, 0.22)",
                    "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                  } as React.CSSProperties
                }
                onClick={() => setImportModalOpen(true)}
              >
                Импорт истории из других приложений
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

        {/* Модальное окно: импорт из файла — оформление как модалка Дзен-мани */}
        <Dialog open={importFileModalOpen} onOpenChange={setImportFileModalOpen}>
          <DialogContent
            showCloseButton={true}
            title="Импорт истории из файла"
            className={cn(
              "w-full max-w-[calc(100%-2rem)] h-[920px] max-h-[min(920px,100dvh)] p-0 gap-0 overflow-hidden flex flex-col",
              "border-0 rounded-[9px]"
            )}
            style={{ backgroundColor: MODAL_BG, width: 1000, maxWidth: "min(1000px, calc(100vw - 2rem))" }}
          >
            <div className="flex flex-col w-full h-full min-h-0">
              <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
                <DialogTitle
                  className="flex items-center gap-3 text-[32px] font-medium"
                  style={{ color: ACTIVE_TEXT_DARK }}
                >
                  <Upload className="w-8 h-8 shrink-0" style={{ color: ACCENT }} />
                  Импорт истории из файла
                </DialogTitle>
              </DialogHeader>

              <div
                className="flex-1 min-h-0 overflow-auto overscroll-contain px-6 py-6"
                style={{ color: ACTIVE_TEXT_DARK, fontSize: 18, fontWeight: 400 }}
              >
                <div className="flex flex-col gap-6">
                  <h3 className="text-2xl font-medium" style={{ color: ACTIVE_TEXT_DARK }}>
                    Резервная копия ПРОСТОФИН
                  </h3>
                  <p style={{ lineHeight: 1.4 }}>
                    Импортируйте ранее экспортированный файл в формате{" "}
                    <span style={{ color: ACCENT }}>.csv</span>. Будут созданы контрагенты, категории, активы и обязательства, цепочки транзакций, транзакции и цели.
                  </p>
                  <div className="flex flex-col gap-2">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => importFileInputRef.current?.click()}
                      onKeyDown={(e) =>
                        (e.key === "Enter" || e.key === " ") && importFileInputRef.current?.click()
                      }
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setImportFileDragOver(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setImportFileDragOver(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setImportFileDragOver(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
                          handleImportFileSelect(file);
                        }
                      }}
                      className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed min-h-[140px] cursor-pointer transition-colors hover:opacity-90"
                      style={{
                        borderColor: importFileDragOver ? ACCENT : ACCENT2,
                        backgroundColor: importFileDragOver
                          ? "rgba(127, 92, 255, 0.12)"
                          : "rgba(85, 68, 209, 0.08)",
                      }}
                    >
                      <Upload className="w-10 h-10 shrink-0" style={{ color: ACCENT }} />
                      {importFile ? (
                        <span className="px-4 text-center break-all" style={{ color: ACTIVE_TEXT_DARK }}>
                          {importFile.name}
                        </span>
                      ) : (
                        <span style={{ color: PLACEHOLDER_COLOR_DARK }}>
                          Нажмите для выбора или перетащите файл
                        </span>
                      )}
                    </div>
                    <input
                      ref={importFileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => handleImportFileSelect(e.target.files?.[0] ?? null)}
                    />
                    {importFile && (
                      <>
                        {isParsingFile && (
                          <div className="p-4" style={{ backgroundColor: BACKGROUND_DT, borderRadius: 9 }}>
                            <p className="text-base" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                              Обработка файла…
                            </p>
                          </div>
                        )}
                        {!isParsingFile && parseFileError && (
                          <div className="p-4" style={{ backgroundColor: BACKGROUND_DT, borderRadius: 9 }}>
                            <p className="text-base" style={{ color: "#FB4C4F" }}>{parseFileError}</p>
                          </div>
                        )}
                        {!isParsingFile && parsedFileData && !parseFileError && (
                          <>
                            <div className="shrink-0 text-center" style={{ fontSize: 18, fontWeight: 400, color: ACTIVE_TEXT_DARK, lineHeight: 1.4 }}>
                              <p>Будут импортированы</p>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                              {[
                                { label: "Контрагенты", value: parsedFileData.counterparties.length },
                                { label: "Категории", value: parsedFileData.categories.length },
                                { label: "Активы и обязательства", value: parsedFileData.items.length },
                                { label: "Цепочки транзакций", value: parsedFileData.transactionChains.length },
                                { label: "Транзакции", value: parsedFileData.transactions.length.toLocaleString("ru-RU") },
                                { label: "Цели", value: parsedFileData.goals.length },
                              ].map(({ label, value }) => (
                                <div
                                  key={label}
                                  className="rounded-lg p-6 flex flex-col items-center justify-center"
                                  style={{ backgroundColor: BACKGROUND_DT }}
                                >
                                  <span
                                    className="mb-2"
                                    style={{ fontSize: 32, fontWeight: 500, color: ACTIVE_TEXT_DARK }}
                                  >
                                    {label}
                                  </span>
                                  <span
                                    className="font-semibold"
                                    style={{
                                      fontSize: 96,
                                      fontWeight: 600,
                                      background: PINK_GRADIENT,
                                      WebkitBackgroundClip: "text",
                                      WebkitTextFillColor: "transparent",
                                      backgroundClip: "text",
                                    }}
                                  >
                                    {value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  {importProgress && (
                    <div className="p-4" style={{ backgroundColor: BACKGROUND_DT, borderRadius: 9 }}>
                      {importProgress.error ? (
                        <p className="text-base" style={{ color: "#FB4C4F" }}>{importProgress.error}</p>
                      ) : (
                        <p className="text-base" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                          {importProgress.total > 0
                            ? `${importProgress.stage} ${importProgress.current} / ${importProgress.total}`
                            : importProgress.stage}
                        </p>
                      )}
                    </div>
                  )}
                  {importResult && (
                    <div
                      className="p-4 rounded-lg border"
                      style={{
                        backgroundColor: importResult.success ? "rgba(52, 211, 153, 0.08)" : "rgba(251, 76, 79, 0.08)",
                        borderColor: importResult.success ? "rgba(52, 211, 153, 0.3)" : "rgba(251, 76, 79, 0.3)",
                        color: importResult.success ? "#34D399" : "#FB4C4F",
                      }}
                    >
                      <p className="text-base">
                        {importResult.success && importResult.counts ? (
                          <>
                            Импорт завершён: контрагенты {importResult.counts.counterparties}, категории {importResult.counts.categories}, активы/обязательства {importResult.counts.items}, цепочки {importResult.counts.transactionChains}, транзакции {importResult.counts.transactions}, цели {importResult.counts.goals}.
                          </>
                        ) : importResult.success ? (
                          "Данные успешно импортированы."
                        ) : (
                          importResult.error ?? "Ошибка импорта."
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 shrink-0 px-6 pb-6 pt-2">
                <Button
                  variant="glass"
                  className="h-12 rounded-lg border-0 px-6 font-normal"
                  style={
                    {
                      "--glass-bg": "rgba(108, 93, 215, 0.22)",
                      "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                      fontSize: 18,
                      fontWeight: 400,
                    } as React.CSSProperties
                  }
                  onClick={() => setImportFileModalOpen(false)}
                >
                  Отмена
                </Button>
                {!importResult ? (
                  <Button
                    variant="authPrimary"
                    className="h-12 rounded-lg border-0 px-8 font-normal"
                    style={
                      {
                        "--auth-primary-bg": "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                        "--auth-primary-bg-hover": "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                        fontSize: 18,
                        fontWeight: 400,
                      } as React.CSSProperties
                    }
                    disabled={isParsingFile || !!importProgress || !parsedFileData}
                    onClick={handleImportFromFile}
                  >
                    {isParsingFile ? "Обработка…" : importProgress ? "Импорт…" : "Импортировать"}
                  </Button>
                ) : (
                  <Button
                    variant="authPrimary"
                    className="h-12 rounded-lg border-0 px-8 font-normal"
                    style={
                      {
                        "--auth-primary-bg": "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                        "--auth-primary-bg-hover": "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                        fontSize: 18,
                        fontWeight: 400,
                      } as React.CSSProperties
                    }
                    onClick={() => setImportFileModalOpen(false)}
                  >
                    Закрыть
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
          <DialogContent
            showCloseButton={true}
            title="Импорт истории из других приложений"
            className={cn(
              "w-full max-w-[calc(100%-2rem)] sm:max-w-xl md:max-w-2xl lg:max-w-4xl xl:max-w-5xl h-[920px] max-h-[min(920px,100dvh)] p-0 gap-0 overflow-hidden flex flex-col",
              "bg-black border-0 rounded-[9px]"
            )}
          >
            <ImportHistoryModalContent
              selectedSource={importSource}
              onSelectSource={setImportSource}
              onLater={() => setImportModalOpen(false)}
              onStartImport={() => {
                if (importSource) {
                  setImportModalOpen(false);
                  setImportServiceModalOpen(true);
                }
              }}
            />
          </DialogContent>
        </Dialog>

        <ImportAccountsOperationsModal
          open={importServiceModalOpen}
          onOpenChange={setImportServiceModalOpen}
          importSource={importSource ?? undefined}
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
