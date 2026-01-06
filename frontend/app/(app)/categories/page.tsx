"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryNode, CategoryScope } from "@/lib/categories";
import {
  CATEGORY_ICON_BY_NAME,
  CATEGORY_ICON_FALLBACK,
  CATEGORY_ICON_OPTIONS,
} from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategoryIcon,
  updateCategoryScope,
  updateCategoryVisibility,
} from "@/lib/api";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

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
};

const MAX_DEPTH = 3;

const SCOPE_OPTIONS: Array<{
  value: CategoryScope;
  label: string;
  dotClass: string;
}> = [
  { value: "INCOME", label: "Доходы", dotClass: "bg-emerald-500" },
  { value: "EXPENSE", label: "Расходы", dotClass: "bg-rose-500" },
  { value: "BOTH", label: "Доходы и расходы", dotClass: "bg-violet-500" },
];

function filterCategories(nodes: CategoryNode[]): CategoryNode[] {
  return nodes
    .filter((node) => node.enabled !== false && !node.archived_at)
    .map((node) => ({
      ...node,
      children: node.children ? filterCategories(node.children) : undefined,
    }));
}

function countNodes(nodes: CategoryNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + countNodes(node.children ?? []),
    0
  );
}

function countDescendants(node: CategoryNode): number {
  return countNodes(node.children ?? []);
}

function CategoryTree({
  nodes,
  depth,
  onAddChild,
  onDelete,
  onEdit,
  expandedIds,
  onToggle,
}: {
  nodes: CategoryNode[];
  depth: number;
  onAddChild: (node: CategoryNode, depth: number) => void;
  onDelete: (node: CategoryNode) => void;
  onEdit: (node: CategoryNode) => void;
  expandedIds: Set<number>;
  onToggle: (id: number) => void;
}) {
  if (nodes.length === 0) return null;
  return (
    <div className="space-y-2">
      {nodes.map((node) => {
        const scopeMeta =
          SCOPE_OPTIONS.find((option) => option.value === node.scope) ??
          SCOPE_OPTIONS[2];
        const iconName =
          node.icon_name && node.icon_name.trim().length > 0 ? node.icon_name : undefined;
        const PreviewIcon =
          (iconName ? CATEGORY_ICON_BY_NAME[iconName] : undefined) ??
          CATEGORY_ICON_FALLBACK ??
          Folder;
        const isDisabled = node.enabled === false;
        const hasChildren = Boolean(node.children && node.children.length > 0);
        const isExpanded = hasChildren && expandedIds.has(node.id);
        return (
          <div key={node.id}>
            <div
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex-nowrap",
                isDisabled && "opacity-50"
              )}
            >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => onToggle(node.id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={
                        isExpanded ? "Свернуть подкатегории" : "Развернуть подкатегории"
                      }
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  ) : (
                    <span className="inline-flex h-6 w-6" aria-hidden="true" />
                  )}
                  <PreviewIcon className="h-4 w-4 text-violet-600" />
                  <span className="truncate font-medium text-slate-900">{node.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className={cn("h-2 w-2 rounded-full", scopeMeta.dotClass)} />
                  <span>{scopeMeta.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 border-2 border-border/70 text-xs"
                    onClick={() => onEdit(node)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Изменить
                  </Button>
                  {depth < MAX_DEPTH && (
                    <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:bg-transparent hover:text-violet-600"
                    onClick={() => onAddChild(node, depth)}
                    aria-label="Добавить подкатегорию"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:bg-transparent hover:text-rose-500"
                  onClick={() => onDelete(node)}
                  aria-label="Удалить категорию"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {isExpanded && node.children && node.children.length > 0 && (
              <div className="ml-5 border-l border-slate-200 pl-4 pt-2">
                <CategoryTree
                  nodes={node.children}
                  depth={depth + 1}
                  onAddChild={onAddChild}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  expandedIds={expandedIds}
                  onToggle={onToggle}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<number | null>(null);
  const [addParentName, setAddParentName] = useState<string | null>(null);
  const [addParentDepth, setAddParentDepth] = useState(0);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<CategoryScope>("BOTH");
  const [newIcon, setNewIcon] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editScope, setEditScope] = useState<CategoryScope>("BOTH");
  const [editIcon, setEditIcon] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());

  const loadCategories = useCallback(
    async (silent?: boolean) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await fetchCategories({ includeArchived: false });
        setCategories(data);
      } catch (e: any) {
        setError(e?.message ?? "Не удалось загрузить категории.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [setCategories]
  );

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const visibleCategories = useMemo(
    () => filterCategories(categories),
    [categories]
  );
  const totalCount = useMemo(
    () => countNodes(visibleCategories),
    [visibleCategories]
  );

  const openAddDialog = (
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
    setFormError(null);
    setIsAddOpen(true);
  };

  const openEditDialog = (node: CategoryNode) => {
    setEditTarget({
      id: node.id,
      name: node.name,
      ownerUserId: node.owner_user_id,
      scope: node.scope,
      iconName: node.icon_name,
    });
    setEditScope(node.scope);
    setEditIcon(node.icon_name ?? "");
    setEditError(null);
  };

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
      await createCategory({
        name: trimmed,
        parent_id: addParentId,
        scope: newScope,
        icon_name: newIcon ? newIcon : null,
      });
      setIsAddOpen(false);
      await loadCategories(true);
    } catch (e: any) {
      setFormError(e?.message ?? "Не удалось добавить категорию.");
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
        await updateCategoryVisibility(deleteTarget.id, false);
      } else {
        await deleteCategory(deleteTarget.id);
      }
      setDeleteTarget(null);
      await loadCategories(true);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось удалить категорию.");
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

      if (updates.length > 0) {
        await Promise.all(updates);
        await loadCategories(true);
      }
      setEditTarget(null);
    } catch (e: any) {
      setEditError(e?.message ?? "Не удалось обновить категорию.");
    } finally {
      setSyncing(false);
    }
  };

  const toggleExpanded = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleScopeChange = async (id: number, scope: CategoryScope) => {
    setSyncing(true);
    setError(null);
    try {
      await updateCategoryScope(id, scope);
      await loadCategories(true);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось обновить тип категории.");
    } finally {
      setSyncing(false);
    }
  };

  const handleIconChange = async (id: number, iconName: string | null) => {
    setSyncing(true);
    setError(null);
    try {
      await updateCategoryIcon(id, iconName);
      await loadCategories(true);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось обновить иконку.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await loadCategories(true);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось обновить категории.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F7F8FA] px-8 py-8">
      <Dialog
        open={isAddOpen}
        onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) {
            setFormError(null);
            setNewName("");
            setNewScope("BOTH");
            setNewIcon("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Добавить категорию</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="grid gap-4">
            {formError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {formError}
              </div>
            )}

            {addParentName && (
              <div className="text-sm text-muted-foreground">
                Родитель: <span className="font-medium text-slate-900">{addParentName}</span>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Название</Label>
              <Input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Например, Продукты"
                className="border-2 border-border/70 bg-white shadow-none"
              />
            </div>

            <div className="grid gap-2">
              <Label>Тип</Label>
              <Select
                value={newScope}
                onValueChange={(value) => setNewScope(value as CategoryScope)}
              >
                <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Иконка</Label>
              <Select
                value={newIcon || "none"}
                onValueChange={(value) => setNewIcon(value === "none" ? "" : value)}
              >
                <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                  <SelectValue placeholder="Без иконки" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без иконки</SelectItem>
                  {CATEGORY_ICON_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex items-center gap-2">
                        <option.Icon className="h-4 w-4 text-slate-600" />
                        <span>{option.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" className="bg-violet-600 text-white hover:bg-violet-700">
                Добавить
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setEditError(null);
            setEditScope("BOTH");
            setEditIcon("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Изменение категории</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="grid gap-4">
            {editError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {editError}
              </div>
            )}

            {editTarget && (
              <div className="text-sm text-muted-foreground">
                Категория: <span className="font-medium text-slate-900">{editTarget.name}</span>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Область</Label>
              <Select
                value={editScope}
                onValueChange={(value) => setEditScope(value as CategoryScope)}
                disabled={editTarget?.ownerUserId == null}
              >
                <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editTarget?.ownerUserId == null && (
                <div className="text-xs text-muted-foreground">
                  Для общих категорий область менять нельзя.
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Иконка</Label>
              <Select
                value={editIcon || "none"}
                onValueChange={(value) => setEditIcon(value === "none" ? "" : value)}
              >
                <SelectTrigger className="border-2 border-border/70 bg-white shadow-none">
                  <SelectValue placeholder="Без иконки" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без иконки</SelectItem>
                  {CATEGORY_ICON_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex items-center gap-2">
                        <option.Icon className="h-4 w-4 text-slate-600" />
                        <span>{option.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Отмена
              </Button>
              <Button
                type="submit"
                className="bg-violet-600 text-white hover:bg-violet-700"
                disabled={syncing}
              >
                Сохранить
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Удалить категорию {deleteTarget ? `"${deleteTarget.name}"` : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.ownerUserId == null
                ? "Категория будет скрыта только для вас."
                : deleteTarget?.childCount
                  ? `Будут удалены и все подкатегории: ${deleteTarget.childCount}.`
                  : "Действие нельзя отменить."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleDelete}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Категории</h1>
            <p className="text-sm text-muted-foreground">
              Управляйте деревом категорий и задавайте, к каким операциям они относятся.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => openAddDialog(null, null, 0)}
            >
              <Plus className="h-4 w-4" />
              Добавить категорию
            </Button>
            <Button
              variant="outline"
              onClick={handleSync}
              disabled={syncing || loading}
            >
              <RefreshCw className={cn("h-4 w-4", syncing ? "animate-spin" : "")} />
              Обновить
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Folder className="h-5 w-5 text-violet-600" />
              Дерево категорий
            </CardTitle>
            <Badge variant="secondary">Всего: {totalCount}</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                Загрузка категорий...
              </div>
            ) : (
              <div className="space-y-3">
                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                    {error}
                  </div>
                )}
                {visibleCategories.length === 0 ? (
                  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                    Категории пока не добавлены.
                  </div>
                ) : (
                  <CategoryTree
                    nodes={visibleCategories}
                    depth={1}
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
                    onToggle={toggleExpanded}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
