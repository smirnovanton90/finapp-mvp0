"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, ChevronDown, Plus, Trash2, Upload, Users } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { FormModal } from "@/components/form-modal";
import { TextField, SelectField } from "@/components/ui/form-field";
import {
  CounterpartyCreate,
  CounterpartyIndustryOut,
  CounterpartyOut,
  CounterpartyType,
  LegalFormOut,
  createCounterparty,
  deleteCounterparty,
  fetchCounterpartiesPage,
  fetchCounterpartyIndustries,
  fetchLegalForms,
  updateCounterparty,
  uploadCounterpartyLogo,
  uploadCounterpartyPhoto,
} from "@/lib/api";
import { useOnboarding } from "@/components/onboarding-context";
import { FilterSection } from "@/components/filter-panel";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { AuthInput } from "@/components/ui/auth-input";
import { CounterpartyCard } from "@/components/counterparty-card";
import { useSidebar } from "@/components/ui/sidebar-context";
import { cn } from "@/lib/utils";
import { ACCENT, ACTIVE_TEXT_DARK, MODAL_BG, PLACEHOLDER_COLOR_DARK, RED, SIDEBAR_TEXT_ACTIVE } from "@/lib/colors";
import { SIDEBAR_FILTERS_SLOT_ID } from "@/lib/sidebar-filters-slot";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_LOGO_DIM = 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeStep, isWizardOpen } = useOnboarding();

  const [counterparties, setCounterparties] = useState<CounterpartyOut[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [industries, setIndustries] = useState<CounterpartyIndustryOut[]>([]);
  const [legalForms, setLegalForms] = useState<LegalFormOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [readyCardCount, setReadyCardCount] = useState(0);
  const readyCardSetRef = useRef<Set<number>>(new Set());
  useEffect(() => setMounted(true), []);

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
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(() => new Set(["added", "default"]));
  const [showLegalEntities, setShowLegalEntities] = useState(true);
  const [showPersonEntities, setShowPersonEntities] = useState(true);
  const [showActiveStatus, setShowActiveStatus] = useState(true);
  const [showDeletedStatus, setShowDeletedStatus] = useState(false);
  const [isIndustryFilterOpen, setIsIndustryFilterOpen] = useState(false);
  const onboardingAppliedRef = useRef<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isWizardOpen) {
      onboardingAppliedRef.current = null;
    }
  }, [isWizardOpen]);

  const legalFormLabel = useMemo(() => {
    const map = new Map(
      legalForms.map((form) => {
        const label = form.label;
        const abbreviated =
          label.includes(" — ")
            ? label.split(" — ")[0].trim()
            : label.includes(" - ")
              ? label.split(" - ")[0].trim()
              : label;
        return [form.code, abbreviated];
      })
    );
    return (code: string | null) => map.get(code ?? "") ?? code ?? "";
  }, [legalForms]);
  const industryLabel = useMemo(() => {
    const map = new Map(industries.map((industry) => [industry.id, industry.name]));
    return (id: number | null) => (id ? map.get(id) ?? "" : "");
  }, [industries]);

  const counterpartyQueryParams = useMemo(() => {
    const entityTypes: ("LEGAL" | "PERSON")[] = [];
    if (showLegalEntities) entityTypes.push("LEGAL");
    if (showPersonEntities) entityTypes.push("PERSON");
    return {
      include_deleted: showDeletedStatus,
      deleted_only: !showActiveStatus && showDeletedStatus,
      source:
        sourceFilter.size > 0
          ? (Array.from(sourceFilter) as ("added" | "default")[])
          : undefined,
      entity_type: entityTypes.length === 2 || entityTypes.length === 0 ? undefined : entityTypes,
      status_active: showActiveStatus,
      status_deleted: showDeletedStatus,
      industry_ids:
        selectedIndustryIds.size > 0 ? Array.from(selectedIndustryIds) : undefined,
      name_query: nameFilter.trim() || undefined,
    };
  }, [
    sourceFilter,
    showLegalEntities,
    showPersonEntities,
    showActiveStatus,
    showDeletedStatus,
    selectedIndustryIds,
    nameFilter,
  ]);

  // Фильтр по имени применяется на бэкенде (name_query); список уже отфильтрован
  const filteredCounterparties = counterparties;

  useEffect(() => {
    const currentIds = new Set(filteredCounterparties.map((c) => c.id));
    readyCardSetRef.current.forEach((id) => {
      if (!currentIds.has(id)) readyCardSetRef.current.delete(id);
    });
    if (filteredCounterparties.length === 0) {
      readyCardSetRef.current.clear();
      setReadyCardCount(0);
    }
  }, [filteredCounterparties.map((c) => c.id).join(",")]);

  const contentVisible =
    !loading &&
    (filteredCounterparties.length === 0 ||
      readyCardCount >= filteredCounterparties.length);

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

  // Открыть форму создания с предзаполненным ИНН при переходе с транзакций (распознавание чека)
  useEffect(() => {
    const create = searchParams.get("create");
    const innFromUrl = searchParams.get("inn");
    if (create === "1" && innFromUrl?.trim()) {
      setEntityType("LEGAL");
      setInn(innFromUrl.trim());
      setEditing(null);
      setIsDialogOpen(true);
    }
  }, [searchParams]);

  const PAGE_SIZE = 50;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pageData, legalFormData, industryData] = await Promise.all([
        fetchCounterpartiesPage({
          ...counterpartyQueryParams,
          limit: PAGE_SIZE,
        }),
        fetchLegalForms(),
        fetchCounterpartyIndustries(),
      ]);
      setCounterparties(pageData.items);
      setNextCursor(pageData.next_cursor);
      setHasMore(pageData.has_more);
      setLegalForms(legalFormData);
      setIndustries(industryData);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось загрузить контрагентов.");
    } finally {
      setLoading(false);
    }
  }, [counterpartyQueryParams]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const pageData = await fetchCounterpartiesPage({
        ...counterpartyQueryParams,
        limit: PAGE_SIZE,
        cursor: nextCursor,
      });
      setCounterparties((prev) => [...prev, ...pageData.items]);
      setNextCursor(pageData.next_cursor);
      setHasMore(pageData.has_more);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось загрузить контрагентов.");
    } finally {
      setLoadingMore(false);
    }
  }, [counterpartyQueryParams, nextCursor, loadingMore]);

  useEffect(() => {
    if (!session) return;
    loadAll();
  }, [session, loadAll]);

  const resetForm = () => {
    setEntityType("LEGAL");
    setIndustryId("");
    setName("");
    setFullName("");
    setLegalForm("");
    setInn("");
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
      // Не сбрасывать форму, если открыли из ссылки «создать с ИНН» (распознавание чека)
      const fromReceipt = searchParams.get("create") === "1" && searchParams.get("inn")?.trim();
      if (!fromReceipt) resetForm();
      return;
    }

    setEntityType(editing.entity_type);
    setIndustryId(editing.industry_id ? String(editing.industry_id) : "");
    setName(editing.name ?? "");
    setFullName(editing.full_name ?? "");
    setLegalForm(editing.legal_form ?? "");
    setInn(editing.inn ?? "");
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
  }, [editing, isDialogOpen, searchParams]);

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
      const msg = e?.message ?? "";
      const isNetworkError =
        msg === "Failed to fetch" ||
        msg === "NetworkError when attempting to fetch resource" ||
        msg === "Load failed";
      setFormError(
        isNetworkError
          ? "Не удалось связаться с сервером. Убедитесь, что бэкенд запущен (например, uvicorn в папке backend)."
          : msg || "Не удалось сохранить контрагента. Проверьте данные и попробуйте снова."
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

  // Convert boolean states to Set for SegmentedSelector
  const statusFilter = useMemo(() => {
    const set = new Set<string>();
    if (showActiveStatus) set.add("ACTIVE");
    if (showDeletedStatus) set.add("DELETED");
    return set;
  }, [showActiveStatus, showDeletedStatus]);

  const handleStatusFilterChange = (value: string | string[] | Set<string>) => {
    const valueSet =
      value instanceof Set
        ? value
        : new Set(Array.isArray(value) ? value : [value]);

    setShowActiveStatus(valueSet.has("ACTIVE"));
    setShowDeletedStatus(valueSet.has("DELETED"));
  };

  const entityTypeFilter = useMemo(() => {
    const set = new Set<string>();
    if (showLegalEntities) set.add("LEGAL");
    if (showPersonEntities) set.add("PERSON");
    return set;
  }, [showLegalEntities, showPersonEntities]);

  const handleEntityTypeFilterChange = (value: string | string[] | Set<string>) => {
    const valueSet =
      value instanceof Set
        ? value
        : new Set(Array.isArray(value) ? value : [value]);
    setShowLegalEntities(valueSet.has("LEGAL"));
    setShowPersonEntities(valueSet.has("PERSON"));
  };

  const openCreateDialog = () => {
    setEditing(null);
    setIsDialogOpen(true);
  };

  const { isCollapsed } = useSidebar();

  return (
    <main className={cn("min-h-screen pb-8", isCollapsed ? "pl-0" : "pl-0")}>
      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      <FormModal
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditing(null);
            setFormError(null);
            if (searchParams.get("create") === "1" && searchParams.get("inn")) {
              router.replace("/counterparties", { scroll: false });
            }
          }
        }}
        title={editing ? "Изменить контрагента" : "Добавить контрагента"}
        icon={<Users className="w-8 h-8" style={{ color: ACTIVE_TEXT_DARK }} />}
        formError={formError}
        onSubmit={handleSubmit}
        onCancel={() => {
          setIsDialogOpen(false);
          setEditing(null);
          setFormError(null);
        }}
        submitLabel={
          isSubmitting
            ? editing
              ? "Сохраняем..."
              : "Добавляем..."
            : editing
              ? "Сохранить"
              : "Добавить"
        }
        loading={isSubmitting}
        size="medium"
      >
        <div className="grid gap-4">
          {/* Image upload and first fields in one row (like assets modal) */}
          <div className="grid grid-cols-[200px_1fr] gap-4 items-center">
            {/* Logo (LEGAL) or Photo (PERSON) upload */}
            <div className="relative">
              {entityType === "LEGAL" ? (
                <>
                  <div
                    className="relative w-[200px] h-[200px] rounded-lg overflow-hidden cursor-pointer transition-all group"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[rgba(93,95,215,0.22)]">
                        <Camera className="w-12 h-12" style={{ color: PLACEHOLDER_COLOR_DARK }} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <Upload className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept={ALLOWED_LOGO_TYPES.join(",")}
                    className="hidden"
                    onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)}
                  />
                </>
              ) : (
                <>
                  <div
                    className="relative w-[200px] h-[200px] rounded-lg overflow-hidden cursor-pointer transition-all group"
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[rgba(93,95,215,0.22)]">
                        <Camera className="w-12 h-12" style={{ color: PLACEHOLDER_COLOR_DARK }} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <Upload className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept={ALLOWED_LOGO_TYPES.join(",")}
                    className="hidden"
                    onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                  />
                </>
              )}
              {(entityType === "LEGAL" ? logoError : photoError) && (
                <p className="text-xs mt-1" style={{ color: "#FB4C4F" }}>
                  {entityType === "LEGAL" ? logoError : photoError}
                </p>
              )}
            </div>

            {/* Type selector (no label) + Отрасль only for LEGAL */}
            <div className="grid content-start gap-4 min-w-0">
              <div className="grid gap-2" role="group" aria-label="Тип контрагента">
                <SegmentedSelector
                  options={[
                    { value: "LEGAL", label: "ЮЛ/ИП", colorScheme: "purple" },
                    { value: "PERSON", label: "ФЛ", colorScheme: "purple" },
                  ]}
                  value={entityType}
                  onChange={(value) => setEntityType(value as CounterpartyType)}
                />
              </div>
              {entityType === "LEGAL" && (
                <SelectField
                  label="Отрасль"
                  value={industryId || "__none"}
                  onValueChange={(v) => setIndustryId(v === "__none" ? "" : v)}
                  options={[
                    { value: "__none", label: industries.length === 0 ? "Нет отраслей" : "Выберите отрасль" },
                    ...industries.map((industry) => ({
                      value: String(industry.id),
                      label: industry.name,
                    })),
                  ]}
                  placeholder="Выберите отрасль"
                  required
                />
              )}
            </div>
          </div>

          {/* Name and rest of fields (full width) */}
          {entityType === "LEGAL" ? (
            <>
              <TextField
                label="Название"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Пятерочка"
                required
              />
              <TextField
                label="Полное юридическое наименование"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Например, АГРОТОРГ"
              />
              <SelectField
                label="Организационно-правовая форма"
                value={legalForm || "__none"}
                onValueChange={(value) => setLegalForm(value === "__none" ? "" : value)}
                options={[
                  { value: "__none", label: "Не выбрано" },
                  ...legalForms.map((form) => ({ value: form.code, label: form.label })),
                ]}
                placeholder="Выберите ОПФ"
              />
              <TextField
                label="ИНН"
                value={inn}
                onChange={(e) =>
                  setInn(e.target.value.replace(/\D/g, "").slice(0, 12))
                }
                placeholder="10 или 12 цифр"
                inputMode="numeric"
              />
            </>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Фамилия"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
                <TextField
                  label="Имя"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <TextField
                label="Отчество"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
              />
            </>
          )}
        </div>
      </FormModal>

      {mounted && typeof document !== "undefined" &&
        createPortal(
          <div className="space-y-4 py-2">
              <FilterSection
                label="Название"
                onReset={() => setNameFilter("")}
                showReset={!!nameFilter}
              >
                <div className="[&_div.relative.flex.items-center]:h-10 [&_input]:text-sm [&_input]:font-normal [&_input:not(:placeholder-shown)]:text-white">
                  <AuthInput
                    type="text"
                    placeholder="Начните вводить текст"
                    value={nameFilter}
                    onChange={(e) => setNameFilter(e.target.value)}
                  />
                </div>
              </FilterSection>

              <FilterSection
                label="Источник"
                onReset={() => setSourceFilter(new Set(["added"]))}
                showReset={sourceFilter.size !== 1 || !sourceFilter.has("added")}
              >
                <SegmentedSelector
                  options={[
                    { value: "added", label: "Добавленные", colorScheme: "purple" },
                    { value: "default", label: "По умолчанию", colorScheme: "purple" },
                  ]}
                  value={sourceFilter}
                  onChange={(value) => {
                    const next = value instanceof Set ? value : new Set(Array.isArray(value) ? value : [value]);
                    setSourceFilter(next);
                  }}
                  multiple={true}
                />
              </FilterSection>

              <FilterSection
                label="Статус"
                onReset={() => {
                  setShowActiveStatus(true);
                  setShowDeletedStatus(false);
                }}
                showReset={!showActiveStatus || showDeletedStatus}
              >
                <SegmentedSelector
                  options={[
                    { value: "ACTIVE", label: "Активный", colorScheme: "green" },
                    { value: "DELETED", label: "Удалено", colorScheme: "red" },
                  ]}
                  value={statusFilter}
                  onChange={handleStatusFilterChange}
                  multiple={true}
                />
              </FilterSection>

              <FilterSection
                label="Тип контрагента"
                onReset={() => {
                  setShowLegalEntities(true);
                  setShowPersonEntities(true);
                }}
                showReset={!(showLegalEntities && showPersonEntities)}
              >
                <SegmentedSelector
                  options={[
                    { value: "LEGAL", label: "ЮЛ/ИП", colorScheme: "purple" },
                    { value: "PERSON", label: "ФЛ", colorScheme: "purple" },
                  ]}
                  value={entityTypeFilter}
                  onChange={handleEntityTypeFilterChange}
                  multiple={true}
                />
              </FilterSection>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1">
                    <div className="text-sm font-medium" style={{ color: SIDEBAR_TEXT_ACTIVE }}>
                      Отрасль
                    </div>
                    <button
                      type="button"
                      aria-label="Свернуть/развернуть"
                      className="rounded-md p-1 hover:bg-[rgba(108,93,215,0.22)] transition-colors"
                      onClick={() => setIsIndustryFilterOpen((prev) => !prev)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isIndustryFilterOpen ? "rotate-0" : "-rotate-90"
                        }`}
                        style={{ color: PLACEHOLDER_COLOR_DARK }}
                      />
                    </button>
                  </div>
                  {selectedIndustryIds.size > 0 && (
                    <button
                      type="button"
                      className="text-sm font-medium hover:underline disabled:opacity-50"
                      style={{ color: ACCENT }}
                      onClick={() => setSelectedIndustryIds(new Set())}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
                {isIndustryFilterOpen && (
                  industries.length === 0 ? (
                    <div className="text-xs" style={{ color: PLACEHOLDER_COLOR_DARK }}>
                      Список отраслей пока пуст.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {industries.map((industry) => (
                        <label
                          key={industry.id}
                          className="flex items-center gap-2 cursor-pointer text-sm"
                          style={{ color: SIDEBAR_TEXT_ACTIVE }}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            style={{ accentColor: ACCENT }}
                            checked={selectedIndustryIds.has(industry.id)}
                            onChange={() => toggleIndustrySelection(industry.id)}
                          />
                          {industry.name}
                        </label>
                      ))}
                    </div>
                  )
                )}
              </div>
          </div>,
          document.getElementById(SIDEBAR_FILTERS_SLOT_ID)!
        )}

      <div className="flex-1 min-w-0">
        <div className="w-full max-w-[900px] xl:max-w-[1350px] mx-auto" style={{ paddingTop: "30px" }}>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Button
              className="rounded-[9px] border-0 flex items-center justify-center transition-colors hover:opacity-90 text-sm font-normal"
              style={{ backgroundColor: ACCENT }}
              onClick={openCreateDialog}
            >
              <Plus className="h-5 w-5 mr-2" style={{ color: "white", opacity: 0.85 }} />
              <span style={{ color: "white", opacity: 0.85 }}>Добавить</span>
            </Button>
          </div>
            {filteredCounterparties.length === 0 && !loading ? (
              <div className="text-center py-12 text-muted-foreground">
                По выбранным фильтрам контрагентов нет.
              </div>
            ) : (
              <>
                <div
                  className="columns-2 xl:columns-3 gap-4"
                  style={{
                    opacity: contentVisible ? 1 : 0,
                    transition: "opacity 0.3s ease-in-out",
                  }}
                >
                  {filteredCounterparties.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        breakInside: "avoid",
                        marginBottom: "1rem",
                      }}
                    >
                      <CounterpartyCard
                        counterparty={item}
                        industryLabel={industryLabel(item.industry_id) || undefined}
                        legalFormLabel={item.entity_type === "LEGAL" && item.legal_form ? legalFormLabel(item.legal_form) : undefined}
                        onEdit={(c) => {
                          setEditing(c);
                          setIsDialogOpen(true);
                        }}
                        onDelete={(c) => setDeleteTarget(c)}
                        onReady={() => {
                          if (!readyCardSetRef.current.has(item.id)) {
                            readyCardSetRef.current.add(item.id);
                            setReadyCardCount((prev) => prev + 1);
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
                {hasMore && (
                  <div className="flex justify-center pt-2">
                    <IconButton
                      type="button"
                      aria-label={loadingMore ? "Загрузка..." : "Загрузить ещё"}
                      onClick={loadMore}
                      disabled={loadingMore || loading}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </IconButton>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent
          className="sm:max-w-[600px] gap-4"
          style={{ backgroundColor: MODAL_BG }}
        >
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle
                className="flex items-center gap-3 text-[32px] font-medium"
                style={{ color: ACTIVE_TEXT_DARK }}
              >
                <Trash2 className="w-8 h-8" style={{ color: RED }} />
                Удалить контрагента?
              </DialogTitle>
            </DialogHeader>
            <p
              className="text-sm"
              style={{ color: PLACEHOLDER_COLOR_DARK }}
            >
              Контрагент будет перемещен в раздел удаленных.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="glass"
                className="rounded-lg border-0"
                style={
                  {
                    "--glass-bg": "rgba(108, 93, 215, 0.22)",
                    "--glass-bg-hover": "rgba(108, 93, 215, 0.4)",
                  } as React.CSSProperties
                }
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                Отмена
              </Button>
              <Button
                type="button"
                className="rounded-lg border-0 bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Удаляем..." : "Удалить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
