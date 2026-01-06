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
import { Folder, Plus, RefreshCw, Trash2 } from "lucide-react";

type DeleteTarget = {
  id: number;
  name: string;
  childCount: number;
  ownerUserId: number | null | undefined;
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
  onScopeChange,
  onIconChange,
}: {
  nodes: CategoryNode[];
  depth: number;
  onAddChild: (node: CategoryNode, depth: number) => void;
  onDelete: (node: CategoryNode) => void;
  onScopeChange: (id: number, scope: CategoryScope) => void;
  onIconChange: (id: number, iconName: string | null) => void;
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
        const isGlobal = node.owner_user_id == null;
        const isDisabled = node.enabled === false;
        return (
          <div key={node.id}>
            <div
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex-nowrap",
                isDisabled && "opacity-50"
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <PreviewIcon className="h-4 w-4 text-violet-600" />
                <span className="truncate font-medium text-slate-900">{node.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={iconName && iconName.trim().length > 0 ? iconName : "none"}
                  onValueChange={(value) =>
                    onIconChange(node.id, value === "none" ? null : value)
                  }
                >
                  <SelectTrigger className="h-8 w-[160px] border-2 border-border/70 bg-white text-xs shadow-none">
                    <SelectValue placeholder="Иконка" />
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
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", scopeMeta.dotClass)} />
                <Select
                  value={node.scope}
                  onValueChange={(value) =>
                    onScopeChange(node.id, value as CategoryScope)
                  }
                  disabled={isGlobal}
                >
                  <SelectTrigger className="h-8 w-[180px] border-2 border-border/70 bg-white text-xs shadow-none">
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
              <div className="flex items-center gap-1">
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
            {node.children && node.children.length > 0 && (
              <div className="ml-5 border-l border-slate-200 pl-4 pt-2">
                <CategoryTree
                  nodes={node.children}
                  depth={depth + 1}
                  onAddChild={onAddChild}
                  onDelete={onDelete}
                  onScopeChange={onScopeChange}
                  onIconChange={onIconChange}
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

  const loadCategories = useCallback(
    async (silent?: boolean) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await fetchCategories();
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
                    onScopeChange={handleScopeChange}
                    onIconChange={handleIconChange}
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
