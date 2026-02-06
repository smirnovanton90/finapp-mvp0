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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  MODAL_BG,
  ACTIVE_TEXT_DARK,
  PLACEHOLDER_COLOR_DARK,
} from "@/lib/colors";
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
  const { accountingStartDate } = useAccountingStart();
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

  useEffect(() => {
    loadProfile();
  }, []);

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

        {/* Импорт истории */}
        <CabinetCard>
          <div className="space-y-4">
            <h3
              className="text-2xl font-medium"
              style={{ color: ACTIVE_TEXT_DARK }}
            >
              Данные
            </h3>
            <Button
              variant="authPrimary"
              className="w-full sm:w-auto rounded-lg border-0"
              style={
                {
                  "--auth-primary-bg":
                    "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                  "--auth-primary-bg-hover":
                    "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                } as React.CSSProperties
              }
              onClick={() => setImportModalOpen(true)}
            >
              Импорт истории из других приложений
            </Button>
          </div>
        </CabinetCard>

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
