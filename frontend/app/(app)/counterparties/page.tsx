"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import {
  Briefcase,
  Building2,
  Factory,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Pencil,
  Plus,
  Shield,
  ShoppingCart,
  Trash2,
  Truck,
  Trophy,
  User,
  Users,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CounterpartyCreate,
  CounterpartyIndustryOut,
  CounterpartyOut,
  CounterpartyType,
  LegalFormOut,
  createCounterparty,
  deleteCounterparty,
  fetchCounterparties,
  fetchCounterpartyIndustries,
  fetchLegalForms,
  updateCounterparty,
  uploadCounterpartyLogo,
  uploadCounterpartyPhoto,
} from "@/lib/api";
import { useOnboarding } from "@/components/onboarding-context";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_LOGO_DIM = 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

const ENTITY_LABELS: Record<CounterpartyType, string> = {
  LEGAL: "ЮЛ/ИП",
  PERSON: "Физическое лицо",
};
const INDUSTRY_ICON_BY_ID: Record<number, LucideIcon> = {
  1: Zap,
  2: Truck,
  3: ShoppingCart,
  4: Shield,
  5: Landmark,
  6: Wifi,
  7: Building2,
  8: GraduationCap,
  9: HeartPulse,
  10: Briefcase,
  11: Trophy,
  12: Home,
};

function getLegalDefaultIcon(industryId: number | null): LucideIcon {
  if (!industryId) return Factory;
  return INDUSTRY_ICON_BY_ID[industryId] ?? Factory;
}

function formatSize(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} МБ`;
}

function buildPersonName(counterparty: CounterpartyOut) {
  if (counterparty.entity_type !== "PERSON") return counterparty.name;
  const parts = [
    counterparty.last_name,
    counterparty.first_name,
    counterparty.middle_name,
  ].filter(Boolean);
  return parts.join(" ") || counterparty.name;
}

function normalizeFilterValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

function getCounterpartyFilterText(counterparty: CounterpartyOut) {
  const base = buildPersonName(counterparty);
  const extra = counterparty.entity_type === "LEGAL" ? counterparty.full_name : null;
  return [base, extra].filter(Boolean).join(" ");
}

export default function CounterpartiesPage() {
  const { data: session } = useSession();
  const { activeStep, isWizardOpen } = useOnboarding();

  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
  const [industries, setIndustries] = useState<CounterpartyIndustryOut[]>([]);
  const [legalForms, setLegalForms] = useState<LegalFormOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CounterpartyOut | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<CounterpartyOut | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [entityType, setEntityType] = useState<CounterpartyType>("LEGAL");
  const [industryId, setIndustryId] = useState("");
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [legalForm, setLegalForm] = useState("");
  const [inn, setInn] = useState("");
  const [ogrn, setOgrn] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [selectedIndustryIds, setSelectedIndustryIds] = useState<Set<number>>(
    () => new Set()
  );
  const [showUserCreated, setShowUserCreated] = useState(true);
  const [showLegalEntities, setShowLegalEntities] = useState(true);
  const [showPersonEntities, setShowPersonEntities] = useState(true);
  const [showActiveStatus, setShowActiveStatus] = useState(true);
  const [showDeletedStatus, setShowDeletedStatus] = useState(false);
  const onboardingAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isWizardOpen) {
      onboardingAppliedRef.current = null;
    }
  }, [isWizardOpen]);

  const legalFormLabel = useMemo(() => {
    const map = new Map(legalForms.map((form) => [form.code, form.label]));
    return (code: string | null) => map.get(code ?? "") ?? code ?? "";
  }, [legalForms]);
  const industryLabel = useMemo(() => {
    const map = new Map(industries.map((industry) => [industry.id, industry.name]));
    return (id: number | null) => (id ? map.get(id) ?? "" : "");
  }, [industries]);

  const normalizedNameFilter = useMemo(
    () => normalizeFilterValue(nameFilter),
    [nameFilter]
  );
  const filteredCounterparties = useMemo(() => {
    return counterparties.filter((item) => {
      const isDeleted = Boolean(item.deleted_at);
      if (isDeleted && !showDeletedStatus) return false;
      if (!isDeleted && !showActiveStatus) return false;
      const isUser = item.owner_user_id != null;
      // Если фильтр включен - показываем только созданные самостоятельно
      // Если фильтр выключен - показываем все (и созданные самостоятельно, и по умолчанию)
      if (showUserCreated && !isUser) return false;
      if (item.entity_type === "LEGAL" && !showLegalEntities) return false;
      if (item.entity_type === "PERSON" && !showPersonEntities) return false;
      if (selectedIndustryIds.size > 0) {
        if (!item.industry_id || !selectedIndustryIds.has(item.industry_id)) {
          return false;
        }
      }
      if (!normalizedNameFilter) return true;
      return normalizeFilterValue(getCounterpartyFilterText(item)).includes(
        normalizedNameFilter
      );
    });
  }, [
    counterparties,
    normalizedNameFilter,
    selectedIndustryIds,
    showUserCreated,
    showDeletedStatus,
    showLegalEntities,
    showPersonEntities,
    showActiveStatus,
    showUserCreated,
  ]);

  useEffect(() => {
    return () => {
      if (logoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreview);
      }
      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [logoPreview, photoPreview]);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [counterpartyData, legalFormData, industryData] = await Promise.all([
        fetchCounterparties({ include_deleted: true }),
        fetchLegalForms(),
        fetchCounterpartyIndustries(),
      ]);
      setCounterparties(counterpartyData);
      setLegalForms(legalFormData);
      setIndustries(industryData);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось загрузить контрагентов.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    loadAll();
  }, [session]);

  const resetForm = () => {
    setEntityType("LEGAL");
    setIndustryId("");
    setName("");
    setFullName("");
    setLegalForm("");
    setInn("");
    setOgrn("");
    setFirstName("");
    setLastName("");
    setMiddleName("");
    setLogoFile(null);
    setLogoError(null);
    setLogoPreview(null);
    setPhotoFile(null);
    setPhotoError(null);
    setPhotoPreview(null);
    setFormError(null);
  };

  useEffect(() => {
    if (!isDialogOpen) return;
    if (!editing) {
      resetForm();
      return;
    }

    setEntityType(editing.entity_type);
    setIndustryId(editing.industry_id ? String(editing.industry_id) : "");
    setName(editing.name ?? "");
    setFullName(editing.full_name ?? "");
    setLegalForm(editing.legal_form ?? "");
    setInn(editing.inn ?? "");
    setOgrn(editing.ogrn ?? "");
    setFirstName(editing.first_name ?? "");
    setLastName(editing.last_name ?? "");
    setMiddleName(editing.middle_name ?? "");
    setLogoFile(null);
    setLogoError(null);
    setLogoPreview(editing.logo_url ?? null);
    setPhotoFile(null);
    setPhotoError(null);
    setPhotoPreview(editing.photo_url ?? null);
    setFormError(null);
  }, [editing, isDialogOpen]);

  useEffect(() => {
    if (!isWizardOpen || activeStep?.key !== "counterparties") return;
    if (onboardingAppliedRef.current === "counterparties") return;
    if (industries.length === 0) return;
    onboardingAppliedRef.current = "counterparties";
    setEditing(null);
    setIsDialogOpen(true);
    setEntityType("LEGAL");
    setIndustryId(String(industries[0].id));
    setName("Магазин у дома");
  }, [activeStep?.key, industries, isWizardOpen]);

  const handleLogoChange = async (file: File | null) => {
    setLogoError(null);

    if (logoPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(logoPreview);
    }

    if (!file) {
      setLogoFile(null);
      setLogoPreview(editing?.logo_url ?? null);
      return;
    }

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setLogoError("Разрешены PNG, JPG или WEBP.");
      setLogoFile(null);
      setLogoPreview(editing?.logo_url ?? null);
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`Размер логотипа не больше ${formatSize(MAX_LOGO_BYTES)}.`);
      setLogoFile(null);
      setLogoPreview(editing?.logo_url ?? null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.width > MAX_LOGO_DIM || image.height > MAX_LOGO_DIM) {
        setLogoError(`Разрешение не больше ${MAX_LOGO_DIM}px.`);
        URL.revokeObjectURL(objectUrl);
        setLogoFile(null);
        setLogoPreview(editing?.logo_url ?? null);
        return;
      }
      setLogoFile(file);
      setLogoPreview(objectUrl);
    };
    image.onerror = () => {
      setLogoError("Не удалось прочитать изображение.");
      URL.revokeObjectURL(objectUrl);
      setLogoFile(null);
      setLogoPreview(editing?.logo_url ?? null);
    };
    image.src = objectUrl;
  };

  const handlePhotoChange = async (file: File | null) => {
    setPhotoError(null);

    if (photoPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreview);
    }

    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(editing?.photo_url ?? null);
      return;
    }

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setPhotoError("Разрешены PNG, JPG или WEBP.");
      setPhotoFile(null);
      setPhotoPreview(editing?.photo_url ?? null);
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setPhotoError(`Размер фотографии не больше ${formatSize(MAX_LOGO_BYTES)}.`);
      setPhotoFile(null);
      setPhotoPreview(editing?.photo_url ?? null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.width > MAX_LOGO_DIM || image.height > MAX_LOGO_DIM) {
        setPhotoError(`Разрешение не больше ${MAX_LOGO_DIM}px.`);
        URL.revokeObjectURL(objectUrl);
        setPhotoFile(null);
        setPhotoPreview(editing?.photo_url ?? null);
        return;
      }
      setPhotoFile(file);
      setPhotoPreview(objectUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setPhotoError("Не удалось прочитать изображение.");
      setPhotoFile(null);
      setPhotoPreview(editing?.photo_url ?? null);
    };
    image.src = objectUrl;
  };

  const validateForm = () => {
    if (entityType === "LEGAL") {
      if (!industryId) {
        setFormError("Укажите отрасль контрагента.");
        return false;
      }
      if (!name.trim()) {
        setFormError("Укажите название контрагента.");
        return false;
      }
      if (inn && !/^\d+$/.test(inn)) {
        setFormError("ИНН должен содержать только цифры.");
        return false;
      }
      if (inn && inn.length !== 10 && inn.length !== 12) {
        setFormError("ИНН должен состоять из 10 или 12 цифр.");
        return false;
      }
      if (ogrn && !/^\d+$/.test(ogrn)) {
        setFormError("ОГРН должен содержать только цифры.");
        return false;
      }
      if (ogrn && ogrn.length !== 13 && ogrn.length !== 15) {
        setFormError("ОГРН должен состоять из 13 или 15 цифр.");
        return false;
      }
      return true;
    }

    if (!lastName.trim() || !firstName.trim()) {
      setFormError("Укажите имя и фамилию.");
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!validateForm()) return;

    const industryValue =
      entityType === "LEGAL" && industryId ? Number(industryId) : null;
    const payload: CounterpartyCreate = {
      entity_type: entityType,
      industry_id: industryValue,
      name: entityType === "LEGAL" ? name.trim() : undefined,
      full_name: entityType === "LEGAL" ? fullName.trim() || null : null,
      legal_form: entityType === "LEGAL" ? legalForm || null : null,
      inn: entityType === "LEGAL" ? inn.trim() || null : null,
      ogrn: entityType === "LEGAL" ? ogrn.trim() || null : null,
      first_name: entityType === "PERSON" ? firstName.trim() : null,
      last_name: entityType === "PERSON" ? lastName.trim() : null,
      middle_name: entityType === "PERSON" ? middleName.trim() || null : null,
    };

    setIsSubmitting(true);
    try {
      const saved = editing
        ? await updateCounterparty(editing.id, payload)
        : await createCounterparty(payload);

      let logoFailed = false;
      if (entityType === "LEGAL" && logoFile) {
        try {
          await uploadCounterpartyLogo(saved.id, logoFile);
        } catch (e: any) {
          setFormError(
            e?.message ??
              "Контрагент сохранен, но логотип загрузить не удалось."
          );
          logoFailed = true;
        }
      }

      let photoFailed = false;
      if (entityType === "PERSON" && photoFile) {
        try {
          await uploadCounterpartyPhoto(saved.id, photoFile);
        } catch (e: any) {
          setFormError(
            e?.message ??
              "Контрагент сохранен, но фотографию загрузить не удалось."
          );
          photoFailed = true;
        }
      }

      await loadAll();
      if (!logoFailed && !photoFailed) {
        setIsDialogOpen(false);
        setEditing(null);
      }
    } catch (e: any) {
      setFormError(
        e?.message ??
          "Не удалось сохранить контрагента. Проверьте данные и попробуйте снова."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteCounterparty(deleteTarget.id);
      await loadAll();
      setDeleteTarget(null);
    } catch (e: any) {
      setError(
        e?.message ?? "Не удалось удалить контрагента. Попробуйте обновить страницу."
      );
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleIndustrySelection = (value: number) => {
    setSelectedIndustryIds((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const segmentedButtonBase =
    "flex-1 min-w-0 rounded-full px-3 py-2 text-sm font-medium text-center whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 flex items-center justify-center";

  return (
    <main className="min-h-screen px-8 py-8">
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full max-w-[340px] shrink-0">
          <div className="rounded-lg border-2 border-border/70 bg-card p-4">
            <div className="space-y-6">
              <Dialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                  setIsDialogOpen(open);
                  if (!open) {
                    setEditing(null);
                    setFormError(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    className="w-full bg-violet-600 text-white hover:bg-violet-700"
                    onClick={() => {
                      setEditing(null);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Добавить
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Изменить контрагента" : "Добавить контрагента"}
            </DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            {formError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {formError}
              </div>
            )}

            <div className="grid gap-2">
              <Label>Тип контрагента</Label>
              <Select
                value={entityType}
                onValueChange={(value) => setEntityType(value as CounterpartyType)}
              >
                <SelectTrigger className="border-2 border-border/70 bg-card shadow-none">
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LEGAL">ЮЛ/ИП</SelectItem>
                  <SelectItem value="PERSON">Физическое лицо</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {entityType === "LEGAL" ? (
              <>
                <div className="grid gap-2">
                  <Label>Отрасль</Label>
                  <Select value={industryId} onValueChange={setIndustryId}>
                    <SelectTrigger className="border-2 border-border/70 bg-card shadow-none">
                      <SelectValue placeholder="Выберите отрасль" />
                    </SelectTrigger>
                    <SelectContent>
                      {industries.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          Нет отраслей
                        </SelectItem>
                      ) : (
                        industries.map((industry) => (
                          <SelectItem key={industry.id} value={String(industry.id)}>
                            {industry.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Название</Label>
                  <Input
                    className="border-2 border-border/70 bg-card shadow-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Например, Пятерочка"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Полное юридическое наименование</Label>
                  <Input
                    className="border-2 border-border/70 bg-card shadow-none"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Например, АГРОТОРГ"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Организационно-правовая форма</Label>
                  <Select
                    value={legalForm}
                    onValueChange={(value) =>
                      setLegalForm(value === "__none" ? "" : value)
                    }
                  >
                    <SelectTrigger className="border-2 border-border/70 bg-card shadow-none">
                      <SelectValue placeholder="Выберите ОПФ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Не выбрано</SelectItem>
                      {legalForms.map((form) => (
                        <SelectItem key={form.code} value={form.code}>
                          {form.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>ИНН</Label>
                    <Input
                      className="border-2 border-border/70 bg-card shadow-none"
                      value={inn}
                      onChange={(e) =>
                        setInn(e.target.value.replace(/\D/g, "").slice(0, 12))
                      }
                      placeholder="10 или 12 цифр"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>ОГРН</Label>
                    <Input
                      className="border-2 border-border/70 bg-card shadow-none"
                      value={ogrn}
                      onChange={(e) =>
                        setOgrn(e.target.value.replace(/\D/g, "").slice(0, 15))
                      }
                      placeholder="13 или 15 цифр"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Логотип</Label>
                  <Input
                    type="file"
                    accept={ALLOWED_LOGO_TYPES.join(",")}
                    className="border-2 border-border/70 bg-card shadow-none"
                    onChange={(event) =>
                      handleLogoChange(event.target.files?.[0] ?? null)
                    }
                  />
                  <div className="text-xs text-muted-foreground">
                    До {formatSize(MAX_LOGO_BYTES)}, не больше {MAX_LOGO_DIM}px, PNG/JPG/WEBP.
                  </div>
                  {logoError && (
                    <div className="text-xs text-red-600">{logoError}</div>
                  )}
                  {logoPreview && (
                    <div className="flex items-center gap-3 rounded-md border border-border/70 bg-white p-2">
                      <img
                        src={logoPreview}
                        alt=""
                        className="h-12 w-12 rounded border border-border/60 object-contain bg-white"
                      />
                      <span className="text-xs text-muted-foreground">
                        Предпросмотр логотипа
                      </span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Фамилия</Label>
                    <Input
                      className="border-2 border-border/70 bg-card shadow-none"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Имя</Label>
                    <Input
                      className="border-2 border-border/70 bg-card shadow-none"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Отчество</Label>
                  <Input
                    className="border-2 border-border/70 bg-card shadow-none"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Фотография</Label>
                  <Input
                    type="file"
                    accept={ALLOWED_LOGO_TYPES.join(",")}
                    className="border-2 border-border/70 bg-card shadow-none"
                    onChange={(event) =>
                      handlePhotoChange(event.target.files?.[0] ?? null)
                    }
                  />
                  <div className="text-xs text-muted-foreground">
                    До {formatSize(MAX_LOGO_BYTES)}, не больше {MAX_LOGO_DIM}px, PNG/JPG/WEBP.
                  </div>
                  {photoError && (
                    <div className="text-xs text-red-600">{photoError}</div>
                  )}
                  {photoPreview && (
                    <div className="flex items-center gap-3 rounded-md border border-border/70 bg-white p-2">
                      <img
                        src={photoPreview}
                        alt=""
                        className="h-12 w-12 rounded border border-border/60 object-contain bg-white"
                      />
                      <span className="text-xs text-muted-foreground">
                        Предпросмотр фотографии
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-2 border-border/70 bg-card shadow-none"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                className="bg-violet-600 text-white hover:bg-violet-700"
                disabled={isSubmitting}
              >
                {editing ? "Сохранить" : "Добавить"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="-mx-4 border-t-2 border-border/70" />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-foreground">Название</div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() => setNameFilter("")}
                    disabled={!nameFilter}
                  >
                    Сбросить
                  </button>
                </div>
                <Input
                  type="text"
                  className="h-10 w-full border-2 border-border/70 bg-card shadow-none"
                  placeholder="Поиск по названию"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-foreground">
                    Созданные самостоятельно
                  </div>
                  <Switch
                    checked={showUserCreated}
                    onCheckedChange={setShowUserCreated}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-foreground">
                    Статус контрагента
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() => {
                      setShowActiveStatus(true);
                      setShowDeletedStatus(true);
                    }}
                    disabled={showActiveStatus && showDeletedStatus}
                  >
                    Сбросить
                  </button>
                </div>
                <div className="inline-flex w-full items-stretch overflow-hidden rounded-full border-2 border-border/70 bg-white p-0.5">
                  <button
                    type="button"
                    aria-pressed={showActiveStatus}
                    onClick={() => setShowActiveStatus((prev) => !prev)}
                    className={`${segmentedButtonBase} ${
                      showActiveStatus
                        ? "bg-violet-50 text-violet-700"
                        : "bg-card text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    Активные
                  </button>
                  <button
                    type="button"
                    aria-pressed={showDeletedStatus}
                    onClick={() => setShowDeletedStatus((prev) => !prev)}
                    className={`${segmentedButtonBase} ${
                      showDeletedStatus
                        ? "bg-slate-100 text-slate-700"
                        : "bg-card text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    Удаленные
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-foreground">
                    Тип контрагента
                  </div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() => {
                      setShowLegalEntities(true);
                      setShowPersonEntities(true);
                    }}
                    disabled={showLegalEntities && showPersonEntities}
                  >
                    Сбросить
                  </button>
                </div>
                <div className="inline-flex w-full items-stretch overflow-hidden rounded-full border-2 border-border/70 bg-white p-0.5">
                  <button
                    type="button"
                    aria-pressed={showLegalEntities}
                    onClick={() => setShowLegalEntities((prev) => !prev)}
                    className={`${segmentedButtonBase} ${
                      showLegalEntities
                        ? "bg-violet-50 text-violet-700"
                        : "bg-card text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    ЮЛ/ИП
                  </button>
                  <button
                    type="button"
                    aria-pressed={showPersonEntities}
                    onClick={() => setShowPersonEntities((prev) => !prev)}
                    className={`${segmentedButtonBase} ${
                      showPersonEntities
                        ? "bg-slate-100 text-slate-700"
                        : "bg-card text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    ФЛ
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-foreground">Отрасль</div>
                  <button
                    type="button"
                    className="text-sm font-medium text-violet-600 hover:underline disabled:text-slate-300"
                    onClick={() => setSelectedIndustryIds(new Set())}
                    disabled={selectedIndustryIds.size === 0}
                  >
                    Сбросить
                  </button>
                </div>
                {industries.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Список отраслей пока пуст.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {industries.map((industry) => (
                      <label
                        key={industry.id}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selectedIndustryIds.has(industry.id)}
                          onChange={() => toggleIndustrySelection(industry.id)}
                        />
                        {industry.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        <div className="flex-1">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">

        {loading ? (
          <div className="text-sm text-muted-foreground">Загрузка контрагентов...</div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}
            {filteredCounterparties.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-muted-foreground">
                По выбранным фильтрам контрагентов нет.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
                {filteredCounterparties.map((item) => {
                  const title =
                    item.entity_type === "PERSON" ? buildPersonName(item) : item.name;
                  const isUser = Boolean(item.owner_user_id);
                  const entityLabel = ENTITY_LABELS[item.entity_type];
                  const legalFormText =
                    item.entity_type === "LEGAL" && item.legal_form
                      ? legalFormLabel(item.legal_form)
                      : null;
                  const industryText = industryLabel(item.industry_id);
                  const isDeleted = Boolean(item.deleted_at);
                  return (
                    <Card
                      key={item.id}
                      className={isDeleted ? "bg-white/70" : "bg-white"}
                    >
                      <CardHeader className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            {(item.entity_type === "PERSON" ? item.photo_url : item.logo_url) ? (
                              <img
                                src={(item.entity_type === "PERSON" ? item.photo_url : item.logo_url) ?? ""}
                                alt=""
                                className={`rounded object-contain bg-white ${
                                  isDeleted ? "h-10 w-10" : "h-12 w-12"
                                }`}
                              />
                            ) : (
                              <div
                                className={`flex items-center justify-center rounded bg-slate-100 text-slate-400 ${
                                  isDeleted ? "h-10 w-10" : "h-12 w-12"
                                }`}
                              >
                                {item.entity_type === "PERSON" ? (
                                  <User
                                    className={isDeleted ? "h-5 w-5" : "h-6 w-6"}
                                    aria-hidden="true"
                                  />
                                ) : (
                                  (() => {
                                    const Icon = getLegalDefaultIcon(item.industry_id);
                                    return (
                                      <Icon
                                        className={isDeleted ? "h-5 w-5" : "h-6 w-6"}
                                        aria-hidden="true"
                                      />
                                    );
                                  })()
                                )}
                              </div>
                            )}
                            <div className="flex min-w-0 items-start gap-2">
                              <CardTitle
                                className={`min-w-0 break-words leading-snug ${
                                  isDeleted ? "text-lg text-slate-600" : "text-lg"
                                }`}
                              >
                                {title}
                              </CardTitle>
                              {isUser && (
                                <Tooltip content="Пользовательский контрагент">
                                  <User
                                    className="h-3.5 w-3.5 shrink-0 text-slate-400"
                                    aria-label="Пользовательский контрагент"
                                  />
                                </Tooltip>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isDeleted && (
                              <Badge className="bg-slate-100 text-slate-500">
                                Удалено
                              </Badge>
                            )}
                            {isUser && !isDeleted && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-muted-foreground hover:bg-transparent hover:text-violet-600"
                                  onClick={() => {
                                    setEditing(item);
                                    setIsDialogOpen(true);
                                  }}
                                  aria-label="Изменить контрагента"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-muted-foreground hover:bg-transparent hover:text-rose-500"
                                  onClick={() => setDeleteTarget(item)}
                                  aria-label="Удалить контрагента"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div className="truncate">
                            {entityLabel}
                            {legalFormText ? ` · ${legalFormText}` : ""}
                          </div>
                          {item.full_name && <div className="truncate">{item.full_name}</div>}
                          {item.entity_type === "LEGAL" && (
                            <div className="truncate">Отрасль: {industryText || "-"}</div>
                          )}
                          {item.license_status && (
                            <div className="truncate">{item.license_status}</div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs text-muted-foreground">
                        {item.entity_type === "LEGAL" && item.inn && (
                          <div>ИНН: {item.inn}</div>
                        )}
                        {item.ogrn && <div>ОГРН: {item.ogrn}</div>}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
          </div>
        </div>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить контрагента?</AlertDialogTitle>
            <AlertDialogDescription>
              Контрагент будет перемещен в раздел удаленных.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
