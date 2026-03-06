"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FormModal } from "@/components/form-modal";
import { TextField, SelectField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterSection } from "@/components/filter-panel";
import { SegmentedSelector } from "@/components/ui/segmented-selector";
import { AuthInput } from "@/components/ui/auth-input";
import { IconButton } from "@/components/ui/icon-button";
import { CategoryNode, CategoryScope, buildCategoryLookup, getCategoryPhotoUrl } from "@/lib/categories";
import { CATEGORY_ICON_OPTIONS } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import {
  API_BASE,
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategoryIcon,
  updateCategoryScope,
  updateCategorySynonyms,
  uploadCategoryPhoto,
  updateCategoryVisibility,
} from "@/lib/api";
import { useOnboarding } from "@/components/onboarding-context";
import { CategoryIconImage } from "@/components/category-icon-image";
import { useSidebar } from "@/components/ui/sidebar-context";
import {
  ACCENT,
  ACTIVE_TEXT_DARK,
  PLACEHOLDER_COLOR_DARK,
  SIDEBAR_TEXT_ACTIVE,
  MODAL_BG,
  BACKGROUND_DT,
  GREEN,
  GREEN_TRANSACTION,
  RED,
} from "@/lib/colors";
import { EmptyState } from "@/components/empty-state";
import { ChipsInput } from "@/components/ui/chips-input";

const ALLOWED_ICON_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_ICON_BYTES = 2 * 1024 * 1024;
import { Camera, ChevronDown, ChevronRight, Folder, Pencil, Plus, MoreVertical, Trash2, Upload, User } from "lucide-react";

type DeleteTarget = {
  id: number;
  name: string;
  childCount: number;
  ownerUserId: number | null | undefined;
};

type EditTarget = {
  id: number;
  name: string;
  ownerUserId: number | null | undefined;
  scope: CategoryScope;
  iconName: string | null | undefined;
  synonyms: string[];
  photo_url?: string | null;
  photo_updated_at?: string | null;
};

const MAX_DEPTH = 3;
/** Отступ вложенности: левый край карточки сдвигается на depth * INDENT_PX, ширина уменьшается, чтобы правый край совпадал у всех уровней. */
const INDENT_PX = 32;

const SCOPE_OPTIONS: Array<{
  value: CategoryScope;
  label: string;
  dotClass: string;
}> = [
  { value: "INCOME", label: "Доходы", dotClass: "bg-emerald-500" },
  { value: "EXPENSE", label: "Расходы", dotClass: "bg-rose-500" },
  { value: "BOTH", label: "Доходы и расходы", dotClass: "bg-violet-500" },
];

function countDescendants(node: CategoryNode): number {
  return (node.children ?? []).reduce(
    (total, child) => total + 1 + countDescendants(child),
    0
  );
}

function filterTreeByFilters(
  nodes: CategoryNode[],
  filters: {
    nameFilter: string;
    scopeFilter: Set<string>;
    sourceFilter: Set<string>;
    statusActive: boolean;
    statusDeleted: boolean;
  }
): CategoryNode[] {
  const nameNorm = filters.nameFilter.trim().toLocaleLowerCase("ru");
  /** Совпадение по имени: пустой фильтр — подходит всё; иначе ищем в названии категории или в названиях родителей. */
  const matchName = (node: CategoryNode, parentNames: string[]) => {
    if (!nameNorm) return true;
    const pathNames = [...parentNames, node.name];
    return pathNames.some((n) => n.toLocaleLowerCase("ru").includes(nameNorm));
  };
  const matchScope = (node: CategoryNode) => {
    if (filters.scopeFilter.size === 0) return true;
    if (filters.scopeFilter.has("INCOME") && (node.scope === "INCOME" || node.scope === "BOTH"))
      return true;
    if (filters.scopeFilter.has("EXPENSE") && (node.scope === "EXPENSE" || node.scope === "BOTH"))
      return true;
    return false;
  };
  const matchSource = (node: CategoryNode) => {
    if (filters.sourceFilter.size === 0) return true;
    const isDefault = node.owner_user_id == null;
    if (filters.sourceFilter.has("default") && isDefault) return true;
    if (filters.sourceFilter.has("added") && !isDefault) return true;
    return false;
  };
  const matchStatus = (node: CategoryNode) => {
    const isActive = node.enabled !== false && !node.archived_at;
    if (filters.statusActive && isActive) return true;
    if (filters.statusDeleted && !isActive) return true;
    return false;
  };

  const walk = (list: CategoryNode[], parentNames: string[]): CategoryNode[] => {
    return list.flatMap((node) => {
      const filteredChildren = node.children?.length
        ? walk(node.children, [...parentNames, node.name])
        : undefined;
      const nodeMatches =
        matchName(node, parentNames) &&
        matchScope(node) &&
        matchSource(node) &&
        matchStatus(node);
      const keepNode =
        nodeMatches || (filteredChildren != null && filteredChildren.length > 0);
      if (!keepNode) return [];
      return [{ ...node, children: filteredChildren }];
    });
  };
  return walk(nodes, []);
}

const ICON_SIZE_PX = 64;
const ICON_2D_SIZE_CLASS = "w-8 h-8"; // размер 2D иконки (в слоте 3D при отсутствии 3D и в отдельном поле 2D)

function CategoryCard({
  node,
  depth,
  parentName,
  categoryLookup,
  apiBase,
  onAddChild,
  onEdit,
  onDelete,
  hasChildren,
  isExpanded,
  onToggleExpand,
  isFilterActive,
}: {
  node: CategoryNode;
  depth: number;
  parentName: string | null;
  categoryLookup: ReturnType<typeof buildCategoryLookup>;
  apiBase: string;
  onAddChild: (node: CategoryNode, depth: number) => void;
  onEdit: (node: CategoryNode) => void;
  onDelete: (node: CategoryNode) => void;
  hasChildren: boolean;
  isExpanded: boolean;
  onToggleExpand: (id: number) => void;
  isFilterActive: boolean;
}) {
  const stripeColor =
    node.scope === "INCOME"
      ? GREEN_TRANSACTION
      : node.scope === "EXPENSE"
        ? RED
        : ACCENT;
  const isDeleted = node.enabled === false || Boolean(node.archived_at);
  const cardBg = isDeleted ? BACKGROUND_DT : MODAL_BG;
  const textColor = isDeleted ? PLACEHOLDER_COLOR_DARK : ACTIVE_TEXT_DARK;

  const indent = depth * INDENT_PX;
  return (
    <div
      className="relative h-auto min-h-0 rounded-lg overflow-hidden mb-3"
      style={{
        marginLeft: indent,
        width: indent > 0 ? `calc(100% - ${indent}px)` : "100%",
        backgroundColor: cardBg,
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[7px] rounded-l-md"
        style={{ backgroundColor: stripeColor }}
      />
      <div className="pt-3 pr-3 pb-3 pl-4 flex items-center gap-4 min-h-0">
        {hasChildren && !isFilterActive ? (
          <IconButton
            aria-label={isExpanded ? "Свернуть" : "Развернуть"}
            onClick={() => onToggleExpand(node.id)}
            className="shrink-0"
          >
            {isExpanded ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </IconButton>
        ) : (
          <span className="w-8 shrink-0" aria-hidden="true" />
        )}
        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{ width: ICON_SIZE_PX, height: ICON_SIZE_PX, filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.2))" }}
        >
          <CategoryIconImage
            categoryId={node.id}
            categoryLookup={categoryLookup}
            apiBase={apiBase}
            size={ICON_SIZE_PX}
            className="w-[64px] h-[64px] object-contain"
            fallbackIconColor={ACCENT}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={cn("font-medium text-lg break-words", isDeleted && "opacity-70")}
            style={{ color: textColor }}
          >
            {node.name}
          </div>
          {parentName && (
            <div className="text-sm mt-0.5">
              <span style={{ color: PLACEHOLDER_COLOR_DARK }}>Родитель </span>
              <span style={{ color: ACTIVE_TEXT_DARK }}>{parentName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {node.owner_user_id != null && (
            <IconButton
              appearance="inactive"
              aria-label="Добавлено пользователем"
              disabled
            >
              <User className="h-4 w-4" />
            </IconButton>
          )}
          {depth < MAX_DEPTH - 1 && !isDeleted && (
            <IconButton
              aria-label="Добавить подкатегорию"
              onClick={() => onAddChild(node, depth)}
            >
              <Plus />
            </IconButton>
          )}
          {!isDeleted && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label="Открыть меню действий">
                  <MoreVertical />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => onEdit(node)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Редактировать
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDelete(node)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryCardList({
  nodes,
  depth,
  parentName,
  categoryLookup,
  apiBase,
  onAddChild,
  onEdit,
  onDelete,
  expandedIds,
  onToggleExpand,
  isFilterActive,
}: {
  nodes: CategoryNode[];
  depth: number;
  parentName: string | null;
  categoryLookup: ReturnType<typeof buildCategoryLookup>;
  apiBase: string;
  onAddChild: (node: CategoryNode, depth: number) => void;
  onEdit: (node: CategoryNode) => void;
  onDelete: (node: CategoryNode) => void;
  expandedIds: Set<number>;
  onToggleExpand: (id: number) => void;
  isFilterActive: boolean;
}) {
  if (nodes.length === 0) return null;
  return (
    <>
      {nodes.map((node) => {
        const hasChildren = Boolean(node.children && node.children.length > 0);
        const showChildren =
          isFilterActive || (hasChildren && expandedIds.has(node.id));
        return (
          <div key={node.id}>
            <CategoryCard
              node={node}
              depth={depth}
              parentName={parentName}
              categoryLookup={categoryLookup}
              apiBase={apiBase}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              hasChildren={hasChildren}
              isExpanded={expandedIds.has(node.id)}
              onToggleExpand={onToggleExpand}
              isFilterActive={isFilterActive}
            />
            {hasChildren && showChildren && (
              <CategoryCardList
                nodes={node.children!}
                depth={depth + 1}
                parentName={node.name}
                categoryLookup={categoryLookup}
                apiBase={apiBase}
                onAddChild={onAddChild}
                onEdit={onEdit}
                onDelete={onDelete}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                isFilterActive={isFilterActive}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

export default function CategoriesPage() {
  const { activeStep, isWizardOpen } = useOnboarding();
  const { filtersSlotId } = useSidebar();
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<number | null>(null);
  const [addParentName, setAddParentName] = useState<string | null>(null);
  const [addParentDepth, setAddParentDepth] = useState(0);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<CategoryScope>("BOTH");
  const [newSynonyms, setNewSynonyms] = useState<string[]>([]);
  const [newIcon, setNewIcon] = useState("");
  const [newIconImage, setNewIconImage] = useState<File | null>(null);
  const [newIconImagePreview, setNewIconImagePreview] = useState<string | null>(null);
  const [newIconImageError, setNewIconImageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const addIconInputRef = useRef<HTMLInputElement>(null);
  const addIconPreviewUrlRef = useRef<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  /** При удалении: true = удалить с дочерними, false = только выбранную */
  const [deleteCascade, setDeleteCascade] = useState(true);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editScope, setEditScope] = useState<CategoryScope>("BOTH");
  const [editSynonyms, setEditSynonyms] = useState<string[]>([]);
  const [editIcon, setEditIcon] = useState("");
  const [editIconImage, setEditIconImage] = useState<File | null>(null);
  const [editIconImagePreview, setEditIconImagePreview] = useState<string | null>(null);
  const [editIconImageError, setEditIconImageError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const editIconInputRef = useRef<HTMLInputElement>(null);
  const editIconPreviewUrlRef = useRef<string | null>(null);
  const onboardingAppliedRef = useRef<string | null>(null);

  const [nameFilter, setNameFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState<Set<string>>(() => new Set());
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(() => new Set());
  const [showActiveStatus, setShowActiveStatus] = useState(true);
  const [showDeletedStatus, setShowDeletedStatus] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!isWizardOpen) {
      onboardingAppliedRef.current = null;
    }
  }, [isWizardOpen]);

  const loadCategories = useCallback(
    async (silent?: boolean) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const includeArchived = showDeletedStatus;
        const data = await fetchCategories({
          includeArchived: includeArchived ? true : false,
          noCache: true,
        });
        setCategories(data);
      } catch (e: unknown) {
        const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Не удалось загрузить категории.";
        setError(message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [showDeletedStatus]
  );

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const categoryLookup = useMemo(() => buildCategoryLookup(categories), [categories]);

  const visibleCategories = useMemo(() => {
    const filtered = filterTreeByFilters(categories, {
      nameFilter,
      scopeFilter,
      sourceFilter,
      statusActive: showActiveStatus,
      statusDeleted: showDeletedStatus,
    });
    const scopeOrder: Record<CategoryScope, number> = {
      INCOME: 0,
      EXPENSE: 1,
      BOTH: 2,
    };
    return [...filtered].sort(
      (a, b) => scopeOrder[a.scope] - scopeOrder[b.scope]
    );
  }, [
    categories,
    nameFilter,
    scopeFilter,
    sourceFilter,
    showActiveStatus,
    showDeletedStatus,
  ]);

  /** При активных фильтрах показываем все найденные уровни развёрнутыми; без фильтров — только первый уровень, остальное по клику. */
  const isFilterActive =
    nameFilter.trim() !== "" ||
    scopeFilter.size > 0 ||
    sourceFilter.size > 0 ||
    !showActiveStatus ||
    showDeletedStatus;

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openAddDialog = useCallback(
    (
      parentId: number | null,
      parentName: string | null,
      parentDepth: number,
      parentScope?: CategoryScope | null
    ) => {
      setAddParentId(parentId);
      setAddParentName(parentName);
      setAddParentDepth(parentDepth);
      setNewName("");
      setNewScope(parentScope ?? "BOTH");
      setNewIcon("");
      setNewIconImage(null);
      setNewIconImagePreview(null);
      setNewIconImageError(null);
      setFormError(null);
      setIsAddOpen(true);
    },
    []
  );

  const handleAddIconImageChange = useCallback((file: File | null) => {
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

  const handleEditIconImageChange = useCallback((file: File | null) => {
    setEditIconImageError(null);
    if (editIconPreviewUrlRef.current) {
      URL.revokeObjectURL(editIconPreviewUrlRef.current);
      editIconPreviewUrlRef.current = null;
    }
    if (!file) {
      setEditIconImage(null);
      setEditIconImagePreview(null);
      return;
    }
    if (!ALLOWED_ICON_TYPES.includes(file.type)) {
      setEditIconImageError("Формат: PNG, JPEG или WebP.");
      setEditIconImage(null);
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      setEditIconImageError("Размер файла не более 2 МБ.");
      setEditIconImage(null);
      return;
    }
    const url = URL.createObjectURL(file);
    editIconPreviewUrlRef.current = url;
    setEditIconImage(file);
    setEditIconImagePreview(url);
  }, []);

  const openEditDialog = useCallback((node: CategoryNode) => {
    setEditTarget({
      id: node.id,
      name: node.name,
      ownerUserId: node.owner_user_id,
      scope: node.scope,
      iconName: node.icon_name,
      synonyms: node.synonyms ?? [],
      photo_url: node.photo_url,
      photo_updated_at: node.photo_updated_at,
    });
    setEditScope(node.scope);
    setEditSynonyms(node.synonyms ?? []);
    setEditIcon(node.icon_name ?? "");
    setEditIconImage(null);
    setEditIconImagePreview(null);
    setEditIconImageError(null);
    setEditError(null);
  }, []);

  useEffect(() => {
    if (!isWizardOpen || activeStep?.key !== "categories") return;
    if (onboardingAppliedRef.current === "categories") return;
    onboardingAppliedRef.current = "categories";
    openAddDialog(null, null, 0, "EXPENSE");
    setNewName("Кофе");
    setNewIcon("Coffee");
  }, [activeStep?.key, isWizardOpen, openAddDialog]);

  const handleAddSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setFormError("Введите название категории.");
      return;
    }
    if (addParentDepth >= MAX_DEPTH) {
      setFormError("Нельзя добавить подкатегорию глубже 3 уровней.");
      return;
    }
    setFormError(null);
    setSyncing(true);
    try {
      const synonymsList = newSynonyms.map((s) => s.trim()).filter((s) => s.length > 0);
      const created = await createCategory({
        name: trimmed,
        parent_id: addParentId,
        scope: newScope,
        icon_name: newIcon ? newIcon : null,
        synonyms: synonymsList.length > 0 ? synonymsList : undefined,
      });
      if (newIconImage) {
        try {
          await uploadCategoryPhoto(created.id, newIconImage);
        } catch (photoErr) {
          console.warn("Failed to upload category photo:", photoErr);
        }
      }
      setIsAddOpen(false);
      await loadCategories(true);
    } catch (e: unknown) {
      const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Не удалось добавить категорию.";
      setFormError(message);
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSyncing(true);
    setError(null);
    try {
      if (deleteTarget.ownerUserId == null) {
        await updateCategoryVisibility(deleteTarget.id, false, {
          cascade: deleteCascade,
        });
      } else {
        await deleteCategory(deleteTarget.id, { cascade: deleteCascade });
      }
      setDeleteTarget(null);
      await loadCategories(true);
    } catch (e: unknown) {
      const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Не удалось удалить категорию.";
      setError(message);
      setDeleteTarget(null);
    } finally {
      setSyncing(false);
    }
  };

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editTarget) return;
    setSyncing(true);
    setError(null);
    setEditError(null);
    try {
      const updates: Promise<unknown>[] = [];
      const isGlobal = editTarget.ownerUserId == null;
      const normalizedIcon = editIcon.trim().length > 0 ? editIcon : null;
      const currentIcon = editTarget.iconName ?? null;

      if (!isGlobal && editScope !== editTarget.scope) {
        updates.push(updateCategoryScope(editTarget.id, editScope));
      }
      if (normalizedIcon !== currentIcon) {
        updates.push(updateCategoryIcon(editTarget.id, normalizedIcon));
      }
      const synonymsList = editSynonyms.map((s) => s.trim()).filter((s) => s.length > 0);
      const currentSynonyms = editTarget.synonyms ?? [];
      const synonymsChanged =
        synonymsList.length !== currentSynonyms.length ||
        synonymsList.some((s, i) => s !== currentSynonyms[i]);
      if (synonymsChanged) {
        updates.push(updateCategorySynonyms(editTarget.id, synonymsList));
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }
      if (editIconImage) {
        try {
          await uploadCategoryPhoto(editTarget.id, editIconImage);
        } catch (photoErr: unknown) {
          const photoMessage = photoErr && typeof photoErr === "object" && "message" in photoErr
            ? String((photoErr as { message: unknown }).message)
            : "Не удалось загрузить изображение.";
          setEditError(photoMessage);
          setSyncing(false);
          return;
        }
      }
      if (updates.length > 0 || editIconImage) {
        await loadCategories(true);
      }
      setEditTarget(null);
    } catch (e: unknown) {
      const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Не удалось обновить категорию.";
      setEditError(message);
    } finally {
      setSyncing(false);
    }
  };

  const handleScopeFilterChange = useCallback((value: string | string[] | Set<string>) => {
    const arr = value instanceof Set ? Array.from(value) : Array.isArray(value) ? value : [value];
    setScopeFilter(new Set(arr));
  }, []);

  const handleSourceFilterChange = useCallback((value: string | string[] | Set<string>) => {
    const arr = value instanceof Set ? Array.from(value) : Array.isArray(value) ? value : [value];
    setSourceFilter(new Set(arr));
  }, []);

  const statusFilterValue = useMemo(
    () => [
      ...(showActiveStatus ? ["active"] : []),
      ...(showDeletedStatus ? ["deleted"] : []),
    ],
    [showActiveStatus, showDeletedStatus]
  );

  return (
    <main className="min-h-screen pb-8">
      <FormModal
        open={isAddOpen}
        onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) {
            setFormError(null);
            setNewName("");
            setNewScope("BOTH");
            setNewSynonyms([]);
            setNewIcon("");
            if (addIconPreviewUrlRef.current) {
              URL.revokeObjectURL(addIconPreviewUrlRef.current);
              addIconPreviewUrlRef.current = null;
            }
            setNewIconImage(null);
            setNewIconImagePreview(null);
            setNewIconImageError(null);
          }
        }}
        title="Добавить категорию"
        icon={<Folder className="w-8 h-8" style={{ color: ACTIVE_TEXT_DARK }} />}
        formError={formError}
        onSubmit={handleAddSubmit}
        onCancel={() => {
          setIsAddOpen(false);
          if (addIconPreviewUrlRef.current) {
            URL.revokeObjectURL(addIconPreviewUrlRef.current);
            addIconPreviewUrlRef.current = null;
          }
          setNewIconImage(null);
          setNewIconImagePreview(null);
        }}
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
                onChange={(e) => handleAddIconImageChange(e.target.files?.[0] ?? null)}
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
          {addParentName && (
            <div className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
              Родитель: <span style={{ color: ACTIVE_TEXT_DARK }}>{addParentName}</span>
            </div>
          )}
          <ChipsInput
            label="Синонимы"
            labelHint="Добавьте альтернативные названия категории. При импорте транзакций из банков категория будет подбираться не только по основному названию, но и по указанным в этом поле синонимам."
            value={newSynonyms}
            onChange={setNewSynonyms}
            placeholder="Введите синоним и нажмите Enter"
            maxItems={50}
            maxLengthPerItem={300}
          />
        </div>
      </FormModal>

      <FormModal
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setEditError(null);
            setEditScope("BOTH");
            setEditSynonyms([]);
            setEditIcon("");
            if (editIconPreviewUrlRef.current) {
              URL.revokeObjectURL(editIconPreviewUrlRef.current);
              editIconPreviewUrlRef.current = null;
            }
            setEditIconImage(null);
            setEditIconImagePreview(null);
            setEditIconImageError(null);
          }
        }}
        title="Изменение категории"
        icon={<Folder className="w-8 h-8" style={{ color: ACTIVE_TEXT_DARK }} />}
        formError={editError}
        onSubmit={handleEditSubmit}
        onCancel={() => {
          setEditTarget(null);
          if (editIconPreviewUrlRef.current) {
            URL.revokeObjectURL(editIconPreviewUrlRef.current);
            editIconPreviewUrlRef.current = null;
          }
          setEditIconImage(null);
          setEditIconImagePreview(null);
        }}
        submitLabel={syncing ? "Сохраняем..." : "Сохранить"}
        loading={syncing}
        size="medium"
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-start">
            <div className="relative">
              <div
                className="relative w-[200px] h-[200px] rounded-lg overflow-hidden cursor-pointer transition-all group"
                onClick={() => editIconInputRef.current?.click()}
              >
                {(editIconImagePreview ?? (editTarget && getCategoryPhotoUrl(editTarget, API_BASE))) ? (
                  <img
                    src={editIconImagePreview ?? (editTarget ? getCategoryPhotoUrl(editTarget, API_BASE) : null) ?? undefined}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : editTarget ? (
                  <div className="w-full h-full flex items-center justify-center bg-[rgba(93,95,215,0.22)]">
                    <CategoryIconImage
                      categoryId={editTarget.id}
                      categoryLookup={categoryLookup}
                      apiBase={API_BASE}
                      size={200}
                      fallbackIconColor={PLACEHOLDER_COLOR_DARK}
                    />
                  </div>
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
                ref={editIconInputRef}
                type="file"
                accept={ALLOWED_ICON_TYPES.join(",")}
                className="hidden"
                onChange={(e) => handleEditIconImageChange(e.target.files?.[0] ?? null)}
              />
              {editIconImageError && (
                <p className="text-xs mt-1" style={{ color: "#FB4C4F" }}>
                  {editIconImageError}
                </p>
              )}
            </div>
            <div className="grid content-start gap-4 min-w-0">
              {editTarget?.ownerUserId != null && (
                <div className="grid gap-2" role="group" aria-label="Область">
                  <Label style={{ color: ACTIVE_TEXT_DARK }}>Область</Label>
                  <SegmentedSelector
                    options={[
                      { value: "INCOME", label: "Доход", colorScheme: "green" },
                      { value: "EXPENSE", label: "Расход", colorScheme: "red" },
                      { value: "BOTH", label: "Доходы и расходы", colorScheme: "purple" },
                    ]}
                    value={editScope}
                    onChange={(value) => setEditScope(value as CategoryScope)}
                  />
                </div>
              )}
              <SelectField
                label="2D иконка"
                value={editIcon || "none"}
                onValueChange={(value) => setEditIcon(value === "none" ? "" : value)}
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
          {editTarget && (
            <div className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
              Категория: <span style={{ color: ACTIVE_TEXT_DARK }}>{editTarget.name}</span>
            </div>
          )}
          <ChipsInput
            label="Синонимы"
            labelHint="Добавьте альтернативные названия категории. При импорте транзакций из банков категория будет подбираться не только по основному названию, но и по указанным в этом поле синонимам."
            value={editSynonyms}
            onChange={setEditSynonyms}
            placeholder="Введите синоним и нажмите Enter"
            maxItems={50}
            maxLengthPerItem={300}
          />
        </div>
      </FormModal>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteCascade(true);
          }
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
              <Trash2 className="w-8 h-8 shrink-0" style={{ color: RED }} />
              {`Удалить категорию ${deleteTarget ? `"${deleteTarget.name}"` : ""}?`}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm" style={{ color: PLACEHOLDER_COLOR_DARK }}>
            {deleteTarget?.childCount != null && deleteTarget.childCount > 0
              ? null
              : deleteTarget?.ownerUserId == null
                ? "Категория будет скрыта только для вас."
                : "Действие нельзя отменить."}
          </div>
          {deleteTarget?.childCount != null && deleteTarget.childCount > 0 && (
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="delete-cascade"
                className="text-sm cursor-pointer"
                style={{ color: ACTIVE_TEXT_DARK }}
              >
                Удалить также все дочерние категории
              </label>
              <Switch
                id="delete-cascade"
                checked={deleteCascade}
                onCheckedChange={setDeleteCascade}
              />
            </div>
          )}
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
              disabled={syncing}
            >
              Отмена
            </Button>
            <Button
              type="button"
              className="rounded-lg border-0 bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              onClick={handleDelete}
              disabled={syncing}
            >
              {syncing ? "..." : "Удалить"}
            </Button>
          </div>
        </div>
      </DialogContent>
      </Dialog>

      {mounted && typeof document !== "undefined" &&
        document.getElementById(filtersSlotId) &&
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
              label="Вид"
              onReset={() => setScopeFilter(new Set())}
              showReset={scopeFilter.size > 0}
            >
              <SegmentedSelector
                options={[
                  { value: "INCOME", label: "Доход", colorScheme: "green" },
                  { value: "EXPENSE", label: "Расход", colorScheme: "red" },
                ]}
                value={scopeFilter}
                onChange={handleScopeFilterChange}
                multiple={true}
              />
            </FilterSection>

            <FilterSection
              label="Источник"
              onReset={() => setSourceFilter(new Set())}
              showReset={sourceFilter.size > 0}
            >
              <SegmentedSelector
                options={[
                  { value: "default", label: "По умолчанию", colorScheme: "purple" },
                  { value: "added", label: "Добавленные", colorScheme: "purple" },
                ]}
                value={sourceFilter}
                onChange={handleSourceFilterChange}
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
                  { value: "active", label: "Действующий", colorScheme: "green" },
                  { value: "deleted", label: "Удаленный", colorScheme: "red" },
                ]}
                value={statusFilterValue}
                onChange={(value) => {
                  const values = Array.isArray(value) ? value : value instanceof Set ? Array.from(value) : [value];
                  setShowActiveStatus(values.includes("active"));
                  setShowDeletedStatus(values.includes("deleted"));
                }}
                multiple={true}
              />
            </FilterSection>
          </div>,
          document.getElementById(filtersSlotId)!
        )}

      <div className="flex-1 min-w-0 pt-[30px]">
        <div className="w-full max-w-[900px] mx-auto px-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              className="rounded-[9px] border-0 flex items-center justify-center gap-2 transition-colors hover:opacity-90 text-sm font-normal"
              style={{ backgroundColor: ACCENT }}
              onClick={() => openAddDialog(null, null, 0)}
            >
              <Plus className="h-5 w-5" style={{ color: "white", opacity: 0.85 }} />
              <span style={{ color: "white", opacity: 0.85 }}>Добавить</span>
            </Button>
          </div>
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
          {visibleCategories.length === 0 && !loading ? (
            <EmptyState />
          ) : (
            <div
              style={{
                opacity: loading ? 0 : 1,
                transition: "opacity 0.3s ease-in-out",
              }}
            >
            <CategoryCardList
              nodes={visibleCategories}
              depth={0}
              parentName={null}
              categoryLookup={categoryLookup}
              apiBase={API_BASE}
              onAddChild={(node, depth) =>
                openAddDialog(node.id, node.name, depth, node.scope)
              }
              onDelete={(node) =>
                setDeleteTarget({
                  id: node.id,
                  name: node.name,
                  childCount: countDescendants(node),
                  ownerUserId: node.owner_user_id,
                })
              }
              onEdit={openEditDialog}
              expandedIds={expandedIds}
              onToggleExpand={toggleExpand}
              isFilterActive={isFilterActive}
            />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
