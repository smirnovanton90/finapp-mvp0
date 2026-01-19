"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { Camera, Upload, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PremiumModal } from "@/components/premium-modal";
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

export default function CabinetPage() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const { accountingStartDate } = useAccountingStart();
  const [profile, setProfile] = useState<UserMeOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Форма профиля
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");

  // Фото
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  // Очистка blob URL при размонтировании
  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await fetchUserMe();
      setProfile(me);
      setFirstName(me.first_name || "");
      setLastName(me.last_name || "");
      setBirthDate(me.birth_date || "");
      // Обновляем photoPreview только если нет активного blob URL (превью выбранного файла)
      if (!photoPreview?.startsWith("blob:")) {
        // Если есть photo_url и это не URL из Google, загружаем фото через API с авторизацией
        if (me.photo_url && me.photo_url.startsWith("http") && !me.photo_url.includes("googleusercontent.com")) {
          const blobUrl = await fetchUserPhotoAsBlob();
          if (blobUrl) {
            setPhotoPreview(blobUrl);
          } else {
            setPhotoPreview(null);
          }
        } else {
          // URL из Google или нет фото
          setPhotoPreview(me.photo_url || null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить профиль.");
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoChange = async (file: File | null) => {
    setPhotoError(null);

    if (photoPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreview);
    }

    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(profile?.photo_url ?? null);
      return;
    }

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError("Разрешены PNG, JPG или WEBP.");
      setPhotoFile(null);
      setPhotoPreview(profile?.photo_url ?? null);
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(`Размер фотографии не больше ${formatSize(MAX_PHOTO_BYTES)}.`);
      setPhotoFile(null);
      setPhotoPreview(profile?.photo_url ?? null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.width > MAX_PHOTO_DIM || image.height > MAX_PHOTO_DIM) {
        setPhotoError(`Разрешение не больше ${MAX_PHOTO_DIM}px.`);
        URL.revokeObjectURL(objectUrl);
        setPhotoFile(null);
        setPhotoPreview(profile?.photo_url ?? null);
        return;
      }
      setPhotoFile(file);
      setPhotoPreview(objectUrl);
    };
    image.onerror = () => {
      setPhotoError("Неверный формат изображения.");
      URL.revokeObjectURL(objectUrl);
      setPhotoFile(null);
      setPhotoPreview(profile?.photo_url ?? null);
    };
    image.src = objectUrl;
  };

  const handlePhotoUpload = async () => {
    if (!photoFile) return;

    setUploadingPhoto(true);
    setPhotoError(null);
    try {
      const updated = await uploadUserPhoto(photoFile);
      // Очищаем blob URL превью выбранного файла
      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
      setPhotoFile(null);
      // Обновляем профиль
      setProfile(updated);
      // Загружаем фото через API с авторизацией и создаем blob URL
      const blobUrl = await fetchUserPhotoAsBlob();
      if (blobUrl) {
        setPhotoPreview(blobUrl);
      } else {
        setPhotoPreview(null);
      }
      setSuccess("Фотография успешно загружена.");
      setTimeout(() => setSuccess(null), 3000);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Загрузка...</div>
      </div>
    );
  }

  // Формируем URL для фото: используем photoPreview, который может быть:
  // 1. blob URL из выбранного файла (превью перед загрузкой)
  // 2. blob URL из загруженного фото (через fetchUserPhotoAsBlob)
  // 3. URL из Google (если фото из Google аккаунта)
  const photoUrl = photoPreview;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Кабинет</h1>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-500/10 text-green-600 dark:text-green-400 rounded-md">
          {success}
        </div>
      )}

      <div className="grid gap-6">
        {/* Секция профиля */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Профиль
              {profile?.google_sub && (
                <Tooltip content="Профиль синхронизирован с Google аккаунтом">
                  <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </Tooltip>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Фото и поля формы */}
              <div className="flex items-start gap-6">
                {/* Фото слева */}
                <div className="flex-shrink-0">
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt="Фото профиля"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Camera className="w-8 h-8 text-muted-foreground" />
                      )}
                    </div>
                    <label
                      htmlFor="photo-upload"
                      className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                    </label>
                    <input
                      id="photo-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => handlePhotoChange(e.target.files?.[0] || null)}
                    />
                  </div>
                  {photoError && (
                    <p className="mt-2 text-sm text-destructive">{photoError}</p>
                  )}
                  {photoFile && (
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handlePhotoUpload}
                        disabled={uploadingPhoto}
                      >
                        {uploadingPhoto ? "Загрузка..." : "Загрузить"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handlePhotoChange(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Поля формы справа */}
                <div className="flex-1 grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="firstName">
                        Имя <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="firstName"
                        className="border-2 border-border/70 bg-card shadow-none"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="lastName">Фамилия</Label>
                      <Input
                        id="lastName"
                        className="border-2 border-border/70 bg-card shadow-none"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="birthDate">Дата рождения</Label>
                    <Input
                      id="birthDate"
                      type="date"
                      className="border-2 border-border/70 bg-card shadow-none"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      max={new Date().toISOString().split("T")[0]}
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                className="bg-violet-600 text-white hover:bg-violet-700"
                disabled={saving}
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Секция настроек */}
        <Card>
          <CardHeader>
            <CardTitle>Настройки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Выбор темы */}
            <div className="flex items-center justify-between">
              <Label>Темная тема</Label>
              <Switch
                checked={theme === "dark"}
                onCheckedChange={(checked) => {
                  setTheme(checked ? "dark" : "light");
                }}
              />
            </div>

            {/* Premium кнопка */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Premium</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Расширенные возможности приложения
                </p>
              </div>
              <Button
                onClick={() => setIsPremiumModalOpen(true)}
                className={cn(
                  "h-[50px] text-[#DCDCDC]",
                  "px-[22px] bg-gradient-to-r from-[#7C6CF1] via-[#6C5DD7] to-[#5544D1] hover:opacity-90"
                )}
              >
                <span className="text-[20px] leading-[22px] font-medium font-['CodecProVariable',sans-serif]">
                  Premium
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Секция информации */}
        {accountingStartDate && (
          <Card>
            <CardHeader>
              <CardTitle>Информация</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label className="text-muted-foreground">Дата начала учета</Label>
                <p className="text-lg font-semibold mt-2">
                  {formatShortDate(accountingStartDate)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <PremiumModal open={isPremiumModalOpen} onOpenChange={setIsPremiumModalOpen} />
    </div>
  );
}
