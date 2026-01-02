"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
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
import {
  CategoryNode,
  CategoryScope,
  DEFAULT_CATEGORIES,
  readStoredCategories,
  writeStoredCategories,
} from "@/lib/categories";
import { cn } from "@/lib/utils";
import { fetchTransactions, TransactionDirection, TransactionOut } from "@/lib/api";
import { Folder, Plus, RefreshCw, Trash2 } from "lucide-react";

type DraftNode = {
  id: string;
  name: string;
  directions: Set<TransactionDirection>;
  children: DraftNode[];
};

type DeleteTarget = {
  id: string;
  name: string;
  childCount: number;
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

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cat_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function cleanCategory(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "-") return null;
  return trimmed;
}

function scopeFromDirections(directions: Set<TransactionDirection>): CategoryScope {
  const hasIncome = directions.has("INCOME");
  const hasExpense = directions.has("EXPENSE");
  if (hasIncome && hasExpense) return "BOTH";
  if (hasIncome) return "INCOME";
  if (hasExpense) return "EXPENSE";
  return "BOTH";
}

function insertDraftNode(
  nodes: DraftNode[],
  path: string[],
  direction: TransactionDirection
) {
  let level = nodes;
  path.forEach((part) => {
    let node = level.find((item) => item.name === part);
    if (!node) {
      node = {
        id: createId(),
        name: part,
        directions: new Set<TransactionDirection>(),
        children: [],
      };
      level.push(node);
    }
    node.directions.add(direction);
    level = node.children;
  });
}

function sortNodes(nodes: CategoryNode[]): CategoryNode[] {
  return [...nodes]
    .map((node) => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function finalizeNodes(nodes: DraftNode[]): CategoryNode[] {
  return sortNodes(
    nodes.map((node) => ({
      id: node.id,
      name: node.name,
      scope: scopeFromDirections(node.directions),
      children: node.children.length ? finalizeNodes(node.children) : undefined,
    }))
  );
}

function buildTreeFromTransactions(transactions: TransactionOut[]): CategoryNode[] {
  const roots: DraftNode[] = [];
  transactions.forEach((tx) => {
    if (tx.direction === "TRANSFER") return;
    const level1 = cleanCategory(tx.category_l1);
    if (!level1) return;
    const level2 = cleanCategory(tx.category_l2);
    const level3 = cleanCategory(tx.category_l3);
    const path = [level1];
    if (level2) path.push(level2);
    if (level2 && level3) path.push(level3);
    insertDraftNode(roots, path, tx.direction);
  });
  return finalizeNodes(roots);
}

function mergeCategoryTrees(
  current: CategoryNode[],
  incoming: CategoryNode[]
): CategoryNode[] {
  const incomingMap = new Map(
    incoming.map((node) => [normalizeName(node.name), node])
  );
  const currentKeys = new Set(current.map((node) => normalizeName(node.name)));

  const merged = current.map((node) => {
    const incomingNode = incomingMap.get(normalizeName(node.name));
    if (!incomingNode) return node;
    const mergedChildren = mergeCategoryTrees(
      node.children ?? [],
      incomingNode.children ?? []
    );
    return {
      ...node,
      children: mergedChildren.length ? mergedChildren : undefined,
    };
  });

  incoming.forEach((node) => {
    if (!currentKeys.has(normalizeName(node.name))) {
      merged.push(node);
    }
  });

  return sortNodes(merged);
}

function updateNodeScope(
  nodes: CategoryNode[],
  id: string,
  scope: CategoryScope
): CategoryNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return { ...node, scope };
    }
    if (node.children) {
      return { ...node, children: updateNodeScope(node.children, id, scope) };
    }
    return node;
  });
}

function addNode(
  nodes: CategoryNode[],
  parentId: string | null,
  node: CategoryNode
): CategoryNode[] {
  if (!parentId) return [...nodes, node];
  return nodes.map((item) => {
    if (item.id === parentId) {
      const nextChildren = item.children ? [...item.children, node] : [node];
      return { ...item, children: nextChildren };
    }
    if (item.children) {
      return { ...item, children: addNode(item.children, parentId, node) };
    }
    return item;
  });
}

function removeNode(nodes: CategoryNode[], id: string): CategoryNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) =>
      node.children
        ? { ...node, children: removeNode(node.children, id) }
        : node
    );
}

function findNodeById(nodes: CategoryNode[], id: string): CategoryNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
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

function hasDuplicateName(
  nodes: CategoryNode[],
  parentId: string | null,
  name: string
): boolean {
  const normalized = normalizeName(name);
  const siblings = parentId ? findNodeById(nodes, parentId)?.children ?? [] : nodes;
  return siblings.some((item) => normalizeName(item.name) === normalized);
}

function CategoryTree({
  nodes,
  depth,
  onAddChild,
  onDelete,
  onScopeChange,
}: {
  nodes: CategoryNode[];
  depth: number;
  onAddChild: (node: CategoryNode, depth: number) => void;
  onDelete: (node: CategoryNode) => void;
  onScopeChange: (id: string, scope: CategoryScope) => void;
}) {
  if (nodes.length === 0) return null;
  return (
    <div className="space-y-2">
      {nodes.map((node) => {
        const scopeMeta =
          SCOPE_OPTIONS.find((option) => option.value === node.scope) ??
          SCOPE_OPTIONS[2];
        return (
          <div key={node.id}>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex-nowrap">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Folder className="h-4 w-4 text-violet-600" />
                <span className="truncate font-medium text-slate-900">{node.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", scopeMeta.dotClass)} />
                <Select
                  value={node.scope}
                  onValueChange={(value) =>
                    onScopeChange(node.id, value as CategoryScope)
                  }
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
  const { data: session } = useSession();
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [addParentName, setAddParentName] = useState<string | null>(null);
  const [addParentDepth, setAddParentDepth] = useState(0);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<CategoryScope>("BOTH");
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    if (!session) return;
    const stored = readStoredCategories();
    if (stored !== null) {
      setCategories(stored);
      setLoading(false);
      setHasHydrated(true);
      return;
    }
    setCategories(DEFAULT_CATEGORIES);
    setLoading(false);
    setHasHydrated(true);
  }, [session]);

  useEffect(() => {
    if (!hasHydrated) return;
    writeStoredCategories(categories);
  }, [categories, hasHydrated]);

  const totalCount = useMemo(() => countNodes(categories), [categories]);

  const openAddDialog = (
    parentId: string | null,
    parentName: string | null,
    parentDepth: number
  ) => {
    setAddParentId(parentId);
    setAddParentName(parentName);
    setAddParentDepth(parentDepth);
    setNewName("");
    setNewScope("BOTH");
    setFormError(null);
    setIsAddOpen(true);
  };

  const handleAddSubmit = (event: React.FormEvent<HTMLFormElement>) => {
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
    if (hasDuplicateName(categories, addParentId, trimmed)) {
      setFormError("Категория с таким названием уже есть на этом уровне.");
      return;
    }

    const nextNode: CategoryNode = {
      id: createId(),
      name: trimmed,
      scope: newScope,
    };

    setCategories((prev) => sortNodes(addNode(prev, addParentId, nextNode)));
    setIsAddOpen(false);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setCategories((prev) => removeNode(prev, deleteTarget.id));
    setDeleteTarget(null);
  };

  const handleScopeChange = (id: string, scope: CategoryScope) => {
    setCategories((prev) => updateNodeScope(prev, id, scope));
  };

  const handleSync = async () => {
    if (!session) return;
    setSyncing(true);
    setError(null);
    try {
      const txs = await fetchTransactions();
      const nextTree = buildTreeFromTransactions(txs);
      setCategories((prev) => mergeCategoryTrees(prev, nextTree));
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
              {deleteTarget?.childCount
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
              Обновить из транзакций
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
                {categories.length === 0 ? (
                  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                    Категории пока не добавлены.
                  </div>
                ) : (
                  <CategoryTree
                    nodes={categories}
                    depth={1}
                    onAddChild={(node, depth) =>
                      openAddDialog(node.id, node.name, depth)
                    }
                    onDelete={(node) =>
                      setDeleteTarget({
                        id: node.id,
                        name: node.name,
                        childCount: countDescendants(node),
                      })
                    }
                    onScopeChange={handleScopeChange}
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
