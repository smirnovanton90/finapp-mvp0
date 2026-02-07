"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Camera, Upload, Users } from "lucide-react";
import { FormModal } from "@/components/form-modal";
import { TextField, SelectField } from "@/components/ui/form-field";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import {
  CounterpartyCreate,
  CounterpartyIndustryOut,
  CounterpartyOut,
  CounterpartyType,
  LegalFormOut,
  createCounterparty,
  fetchCounterpartyIndustries,
  fetchLegalForms,
  uploadCounterpartyLogo,
  uploadCounterpartyPhoto,
} from "@/lib/api";
import { ACTIVE_TEXT_DARK, PLACEHOLDER_COLOR_DARK } from "@/lib/colors";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_LOGO_DIM = 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

function formatSize(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} МБ`;
}

export type CreateCounterpartyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (created: CounterpartyOut) => void;
  /** Pre-select this industry when opening (e.g. "Банки" when adding bank from import). */
  initialIndustryId?: number | null;
  /** For nested modal: e.g. "z-[100]" to appear above parent. */
  overlayClassName?: string;
  containerClassName?: string;
  /** When false, no focus trap — use when opening from another modal so parent stays open. */
  modal?: boolean;
};

export function CreateCounterpartyModal({
  open,
  onOpenChange,
  onSuccess,
  initialIndustryId,
  overlayClassName,
  containerClassName,
  modal = true,
}: CreateCounterpartyModalProps) {
  const [industries, setIndustries] = useState<CounterpartyIndustryOut[]>([]);
  const [legalForms, setLegalForms] = useState<LegalFormOut[]>([]);
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
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([fetchCounterpartyIndustries(), fetchLegalForms()])
      .then(([industriesData, legalFormsData]) => {
        setIndustries(industriesData);
        setLegalForms(legalFormsData);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open && initialIndustryId != null && industries.length > 0) {
      const exists = industries.some((ind) => ind.id === initialIndustryId);
      if (exists) setIndustryId(String(initialIndustryId));
    }
  }, [open, initialIndustryId, industries]);

  const handleLogoChange = useCallback((file: File | null) => {
    setLogoError(null);
    if (logoPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(logoPreview);
    }
    if (!file) {
      setLogoFile(null);
      setLogoPreview(null);
      return;
    }
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setLogoError("Разрешены PNG, JPG или WEBP.");
      setLogoFile(null);
      setLogoPreview(null);
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`Размер логотипа не больше ${formatSize(MAX_LOGO_BYTES)}.`);
      setLogoFile(null);
      setLogoPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.width > MAX_LOGO_DIM || image.height > MAX_LOGO_DIM) {
        setLogoError(`Разрешение не больше ${MAX_LOGO_DIM}px.`);
        URL.revokeObjectURL(objectUrl);
        setLogoFile(null);
        setLogoPreview(null);
        return;
      }
      setLogoFile(file);
      setLogoPreview(objectUrl);
    };
    image.onerror = () => {
      setLogoError("Не удалось прочитать изображение.");
      URL.revokeObjectURL(objectUrl);
      setLogoFile(null);
      setLogoPreview(null);
    };
    image.src = objectUrl;
  }, [logoPreview]);

  const handlePhotoChange = useCallback((file: File | null) => {
    setPhotoError(null);
    if (photoPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreview);
    }
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setPhotoError("Разрешены PNG, JPG или WEBP.");
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setPhotoError(`Размер фотографии не больше ${formatSize(MAX_LOGO_BYTES)}.`);
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.width > MAX_LOGO_DIM || image.height > MAX_LOGO_DIM) {
        setPhotoError(`Разрешение не больше ${MAX_LOGO_DIM}px.`);
        URL.revokeObjectURL(objectUrl);
        setPhotoFile(null);
        setPhotoPreview(null);
        return;
      }
      setPhotoFile(file);
      setPhotoPreview(objectUrl);
    };
    image.onerror = () => {
      setPhotoError("Не удалось прочитать изображение.");
      URL.revokeObjectURL(objectUrl);
      setPhotoFile(null);
      setPhotoPreview(null);
    };
    image.src = objectUrl;
  }, [photoPreview]);

  const resetForm = useCallback(() => {
    setEntityType("LEGAL");
    setIndustryId("");
    setName("");
    setFullName("");
    setLegalForm("");
    setInn("");
    setFirstName("");
    setLastName("");
    setMiddleName("");
    if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError(null);
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoError(null);
    setFormError(null);
  }, [logoPreview, photoPreview]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm();
      onOpenChange(next);
    },
    [onOpenChange, resetForm]
  );

  const validateForm = () => {
    if (entityType === "LEGAL") {
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

    const payload: CounterpartyCreate = {
      entity_type: entityType,
      industry_id: entityType === "LEGAL" && industryId ? Number(industryId) : null,
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
      const saved = await createCounterparty(payload);

      if (entityType === "LEGAL" && logoFile) {
        try {
          await uploadCounterpartyLogo(saved.id, logoFile);
        } catch (e: unknown) {
          const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
          setFormError(msg || "Контрагент сохранен, но логотип загрузить не удалось.");
          setIsSubmitting(false);
          return;
        }
      }
      if (entityType === "PERSON" && photoFile) {
        try {
          await uploadCounterpartyPhoto(saved.id, photoFile);
        } catch (e: unknown) {
          const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
          setFormError(msg || "Контрагент сохранен, но фотографию загрузить не удалось.");
          setIsSubmitting(false);
          return;
        }
      }

      handleOpenChange(false);
      onSuccess(saved);
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
      const isNetworkError =
        msg === "Failed to fetch" ||
        msg === "NetworkError when attempting to fetch resource" ||
        msg === "Load failed";
      setFormError(
        isNetworkError
          ? "Не удалось связаться с сервером."
          : msg || "Не удалось сохранить контрагента."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Добавить контрагента"
      overlayClassName={overlayClassName}
      containerClassName={containerClassName}
      modal={modal}
      icon={<Users className="w-8 h-8" style={{ color: ACTIVE_TEXT_DARK }} />}
      formError={formError}
      onSubmit={handleSubmit}
      onCancel={() => handleOpenChange(false)}
      submitLabel={isSubmitting ? "Добавляем..." : "Добавить"}
      loading={isSubmitting}
      size="medium"
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-center">
          <div className="relative">
            {entityType === "LEGAL" ? (
              <>
                <div
                  className="relative w-[200px] h-[200px] rounded-lg overflow-hidden cursor-pointer transition-all group"
                  onClick={() => (document.getElementById("create-cp-logo-input") as HTMLInputElement)?.click()}
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt="" className="w-full h-full object-cover" />
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
                  id="create-cp-logo-input"
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
                  onClick={() => (document.getElementById("create-cp-photo-input") as HTMLInputElement)?.click()}
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="" className="w-full h-full object-cover" />
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
                  id="create-cp-photo-input"
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
                  }))]}
                placeholder="Выберите отрасль"
              />
            )}
          </div>
        </div>
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
              onChange={(e) => setInn(e.target.value.replace(/\D/g, "").slice(0, 12))}
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
  );
}
