"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, Folder, Upload } from "lucide-react";
import { FormModal } from "@/components/form-modal";
import { Label } from "@/components/ui/label";
import { TextField, SelectField } from "@/components/ui/form-field";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { CATEGORY_ICON_OPTIONS } from "@/lib/category-icons";
import type { CategoryScope } from "@/lib/categories";
import { createCategory } from "@/lib/api";
import { ACTIVE_TEXT_DARK, PLACEHOLDER_COLOR_DARK } from "@/lib/colors";

const ALLOWED_ICON_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_ICON_BYTES = 2 * 1024 * 1024;

export type CreateCategoryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (created: { id: number; name: string }) => void;
};

export function CreateCategoryModal({
  open,
  onOpenChange,
  onSuccess,
}: CreateCategoryModalProps) {
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<CategoryScope>("EXPENSE");
  const [newIcon, setNewIcon] = useState("");
  const [newIconImage, setNewIconImage] = useState<File | null>(null);
  const [newIconImagePreview, setNewIconImagePreview] = useState<string | null>(null);
  const [newIconImageError, setNewIconImageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const addIconInputRef = useRef<HTMLInputElement>(null);
  const addIconPreviewUrlRef = useRef<string | null>(null);

  const handleIconImageChange = useCallback((file: File | null) => {
    setNewIconImageError(null);
    if (addIconPreviewUrlRef.current) {
      URL.revokeObjectURL(addIconPreviewUrlRef.current);
      addIconPreviewUrlRef.current = null;
    }
    if (!file) {
      setNewIconImage(null);
      setNewIconImagePreview(null);
      return;
    }
    if (!ALLOWED_ICON_TYPES.includes(file.type)) {
      setNewIconImageError("Формат: PNG, JPEG или WebP.");
      setNewIconImage(null);
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      setNewIconImageError("Размер файла не более 2 МБ.");
      setNewIconImage(null);
      return;
    }
    const url = URL.createObjectURL(file);
    addIconPreviewUrlRef.current = url;
    setNewIconImage(file);
    setNewIconImagePreview(url);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setFormError(null);
        setNewName("");
        setNewScope("EXPENSE");
        setNewIcon("");
        if (addIconPreviewUrlRef.current) {
          URL.revokeObjectURL(addIconPreviewUrlRef.current);
          addIconPreviewUrlRef.current = null;
        }
        setNewIconImage(null);
        setNewIconImagePreview(null);
        setNewIconImageError(null);
      }
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setFormError("Введите название категории.");
      return;
    }
    setFormError(null);
    setSyncing(true);
    try {
      const created = await createCategory({
        name: trimmed,
        parent_id: null,
        scope: newScope,
        icon_name: newIcon ? newIcon : null,
      });
      handleOpenChange(false);
      onSuccess(created);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Не удалось добавить категорию.";
      setFormError(message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Добавить категорию"
      icon={<Folder className="w-8 h-8" style={{ color: ACTIVE_TEXT_DARK }} />}
      formError={formError}
      onSubmit={handleSubmit}
      onCancel={() => handleOpenChange(false)}
      submitLabel={syncing ? "Добавляем..." : "Добавить"}
      loading={syncing}
      size="medium"
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-start">
          <div className="relative">
            <div
              className="relative w-[200px] h-[200px] rounded-lg overflow-hidden cursor-pointer transition-all group"
              onClick={() => addIconInputRef.current?.click()}
            >
              {newIconImagePreview ? (
                <img
                  src={newIconImagePreview}
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
              ref={addIconInputRef}
              type="file"
              accept={ALLOWED_ICON_TYPES.join(",")}
              className="hidden"
              onChange={(e) => handleIconImageChange(e.target.files?.[0] ?? null)}
            />
            {newIconImageError && (
              <p className="text-xs mt-1" style={{ color: "#FB4C4F" }}>
                {newIconImageError}
              </p>
            )}
          </div>
          <div className="grid content-start gap-4 min-w-0">
            <div className="grid gap-2" role="group" aria-label="Тип">
              <Label style={{ color: ACTIVE_TEXT_DARK }}>Тип</Label>
              <SegmentedSelector
                options={[
                  { value: "INCOME", label: "Доход", colorScheme: "green" },
                  { value: "EXPENSE", label: "Расход", colorScheme: "red" },
                  { value: "BOTH", label: "Доходы и расходы", colorScheme: "purple" },
                ]}
                value={newScope}
                onChange={(value) => setNewScope(value as CategoryScope)}
              />
            </div>
            <SelectField
              label="2D иконка"
              value={newIcon || "none"}
              onValueChange={(value) => setNewIcon(value === "none" ? "" : value)}
              options={[
                { value: "none", label: "Без иконки" },
                ...CATEGORY_ICON_OPTIONS.map((option) => ({
                  value: option.value,
                  label: (
                    <span className="flex items-center gap-2">
                      <option.Icon className="h-4 w-4" style={{ color: PLACEHOLDER_COLOR_DARK }} />
                      <span>{option.label}</span>
                    </span>
                  ),
                }))]}
              placeholder="Без иконки"
            />
          </div>
        </div>
        <TextField
          label="Название"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Например, Продукты"
          required
        />
      </div>
    </FormModal>
  );
}
