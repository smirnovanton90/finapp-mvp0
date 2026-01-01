"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Layers3, Minus, Plus, Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  CategoryOut,
  createCategory,
  deleteCategory,
  fetchCategories,
} from "@/lib/api";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newLevel, setNewLevel] = useState<1 | 2 | 3>(1);
  const [newL1, setNewL1] = useState("");
  const [newL2Name, setNewL2Name] = useState("");
  const [newL2Parent, setNewL2Parent] = useState<number | null>(null);
  const [newL3Name, setNewL3Name] = useState("");
  const [newL3Parent, setNewL3Parent] = useState<number | null>(null);
  const [dirIncome, setDirIncome] = useState(false);
  const [dirExpense, setDirExpense] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const [expandedL1, setExpandedL1] = useState<Set<number>>(new Set());
  const [expandedL2, setExpandedL2] = useState<Set<number>>(new Set());

  async function loadCategories() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCategories();
      setCategories(data);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось загрузить категории");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  const level1 = useMemo(
    () => categories.filter((c) => c.level === 1).sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  const level2 = useMemo(
    () => categories.filter((c) => c.level === 2).sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  const level3 = useMemo(
    () => categories.filter((c) => c.level === 3).sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  const level2ByParent = useMemo(() => {
    const map = new Map<number, CategoryOut[]>();
    level2.forEach((c) => {
      if (!c.parent_id) return;
      map.set(c.parent_id, [...(map.get(c.parent_id) ?? []), c]);
    });
    return map;
  }, [level2]);

  const level3ByParent = useMemo(() => {
    const map = new Map<number, CategoryOut[]>();
    level3.forEach((c) => {
      if (!c.parent_id) return;
      map.set(c.parent_id, [...(map.get(c.parent_id) ?? []), c]);
    });
    return map;
  }, [level3]);

  async function handleDelete(id: number) {
    if (!confirm("Удалить категорию и все вложенные?")) return;
    setError(null);
    try {
      await deleteCategory(id);
      await loadCategories();
    } catch (e: any) {
      setError(e?.message ?? "Не удалось удалить категорию");
    }
  }

  useEffect(() => {
    if (newLevel === 2 && !newL2Parent && level1[0]) {
      setNewL2Parent(level1[0].id);
    }
    if (newLevel === 3 && !newL3Parent && level2[0]) {
      setNewL3Parent(level2[0].id);
    }
  }, [level1, level2, newLevel, newL2Parent, newL3Parent]);

  const segmentedButtonBase =
    "flex-1 rounded-sm px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500";

  function resetForm() {
    setNewLevel(1);
    setNewL1("");
    setNewL2Name("");
    setNewL3Name("");
    setNewL2Parent(level1[0]?.id ?? null);
    setNewL3Parent(level2[0]?.id ?? null);
    setDirIncome(false);
    setDirExpense(true);
    setFormError(null);
  }

  const resolvedDirection = useMemo(() => {
    if (dirIncome && dirExpense) return "BOTH";
    if (dirIncome) return "INCOME";
    return "EXPENSE";
  }, [dirIncome, dirExpense]);

  async function onCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    try {
      if (!dirIncome && !dirExpense) {
        setFormError("Выберите, к каким операциям относится категория");
        return;
      }

      if (newLevel === 1) {
        if (!newL1.trim()) {
          setFormError("Укажите название категории");
          return;
        }
        await createCategory({
          name: newL1.trim(),
          level: 1,
          direction: resolvedDirection,
        });
      } else if (newLevel === 2) {
        if (!newL2Parent) {
          setFormError("Выберите категорию первого уровня");
          return;
        }
        if (!newL2Name.trim()) {
          setFormError("Укажите название категории");
          return;
        }
        await createCategory({
          name: newL2Name.trim(),
          level: 2,
          parent_id: newL2Parent,
          direction: resolvedDirection,
        });
      } else {
        if (!newL3Parent) {
          setFormError("Выберите категорию второго уровня");
          return;
        }
        if (!newL3Name.trim()) {
          setFormError("Укажите название категории");
          return;
        }
        await createCategory({
          name: newL3Name.trim(),
          level: 3,
          parent_id: newL3Parent,
          direction: resolvedDirection,
        });
      }

      resetForm();
      setIsCreateOpen(false);
      await loadCategories();
    } catch (e: any) {
      setFormError(e?.message ?? "Не удалось создать категорию");
    }
  }

  const toggleL1 = (id: number) => {
    setExpandedL1((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleL2 = (id: number) => {
    setExpandedL2((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderLevel3 = (parentId: number) => {
    const children = level3ByParent.get(parentId) ?? [];
    if (!children.length) return null;

    return (
      <div className="ml-12 space-y-2 border-l pl-4">
        {children.map((cat) => (
          <div key={cat.id} className="flex items-center justify-between rounded-md bg-white px-3 py-2 shadow-sm">
            <span>{cat.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              onClick={() => handleDelete(cat.id)}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    );
  };

  const renderLevel2 = (parentId: number) => {
    const children = level2ByParent.get(parentId) ?? [];
    if (!children.length) return null;

    return (
      <div className="mt-2 space-y-2">
        {children.map((cat) => {
          const hasLevel3 = (level3ByParent.get(cat.id) ?? []).length > 0;
          const isExpanded = expandedL2.has(cat.id);

          return (
            <div key={cat.id} className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {hasLevel3 ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => toggleL2(cat.id)}
                    >
                      {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  ) : (
                    <span className="h-8 w-8" />
                  )}
                  <span>{cat.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground"
                  onClick={() => handleDelete(cat.id)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>

              {hasLevel3 && isExpanded && renderLevel3(cat.id)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-muted/40 px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Категории</h1>
          <p className="text-sm text-muted-foreground">
            Управляйте иерархией категорий транзакций. Удаление категории также удаляет все подкатегории.
          </p>
        </div>
        <Layers3 className="h-6 w-6 text-muted-foreground" />
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4 flex justify-end">
        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (open) {
              resetForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-violet-600 text-white hover:bg-violet-700">
              <Plus className="mr-2 h-4 w-4" />
              Добавить
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Добавление категории</DialogTitle>
            </DialogHeader>

            <form onSubmit={onCreateSubmit} className="grid gap-4">
              {formError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid gap-2" role="group" aria-label="Уровень категории">
                <div className="inline-flex w-full items-stretch overflow-hidden rounded-md border border-input bg-muted/60 p-0.5">
                  <button
                    type="button"
                    aria-pressed={newLevel === 1}
                    onClick={() => setNewLevel(1)}
                    className={`${segmentedButtonBase} ${
                      newLevel === 1
                        ? "bg-violet-50 text-violet-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Уровень 1
                  </button>
                  <button
                    type="button"
                    aria-pressed={newLevel === 2}
                    onClick={() => setNewLevel(2)}
                    className={`${segmentedButtonBase} ${
                      newLevel === 2
                        ? "bg-violet-50 text-violet-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Уровень 2
                  </button>
                  <button
                    type="button"
                    aria-pressed={newLevel === 3}
                    onClick={() => setNewLevel(3)}
                    className={`${segmentedButtonBase} ${
                      newLevel === 3
                        ? "bg-violet-50 text-violet-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Уровень 3
                  </button>
                </div>
              </div>

              <div className="grid gap-2" role="group" aria-label="Тип операции">
                <Label className="text-xs font-medium text-muted-foreground">Категория для</Label>
                <div className="inline-flex w-full items-stretch overflow-hidden rounded-md border border-input bg-muted/60 p-0.5">
                  <button
                    type="button"
                    aria-pressed={dirIncome}
                    onClick={() => {
                      const next = !dirIncome;
                      if (!next && !dirExpense) {
                        setDirIncome(true);
                        return;
                      }
                      setDirIncome(next);
                    }}
                    className={`${segmentedButtonBase} ${
                      dirIncome
                        ? "bg-violet-50 text-violet-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Доход
                  </button>
                  <button
                    type="button"
                    aria-pressed={dirExpense}
                    onClick={() => {
                      const next = !dirExpense;
                      if (!next && !dirIncome) {
                        setDirExpense(true);
                        return;
                      }
                      setDirExpense(next);
                    }}
                    className={`${segmentedButtonBase} ${
                      dirExpense
                        ? "bg-violet-50 text-violet-700"
                        : "bg-white text-muted-foreground hover:bg-white"
                    }`}
                  >
                    Расход
                  </button>
                </div>
              </div>

              {newLevel === 2 && (
                <div className="grid gap-2">
                  <Label>Категория 1 уровня</Label>
                  <Select
                    value={newL2Parent ? String(newL2Parent) : ""}
                    onValueChange={(v) => setNewL2Parent(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите родителя" />
                    </SelectTrigger>
                    <SelectContent>
                      {level1.map((cat) => (
                        <SelectItem key={cat.id} value={String(cat.id)}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {newLevel === 3 && (
                <div className="grid gap-2">
                  <Label>Категория 2 уровня</Label>
                  <Select
                    value={newL3Parent ? String(newL3Parent) : ""}
                    onValueChange={(v) => setNewL3Parent(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите родителя" />
                    </SelectTrigger>
                    <SelectContent>
                      {level1.map((parent) => (
                        <div key={parent.id}>
                          <div className="px-3 py-1 text-xs font-medium text-muted-foreground">{parent.name}</div>
                          {(level2ByParent.get(parent.id) ?? []).map((child) => (
                            <SelectItem key={child.id} value={String(child.id)}>
                              {child.name}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-2">
                <Label>Название категории</Label>
                <Input
                  value={newLevel === 1 ? newL1 : newLevel === 2 ? newL2Name : newL3Name}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (newLevel === 1) setNewL1(value);
                    if (newLevel === 2) setNewL2Name(value);
                    if (newLevel === 3) setNewL3Name(value);
                  }}
                  placeholder="Введите название"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={loading} className="bg-violet-600 text-white hover:bg-violet-700">
                  Создать
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-violet-100">
        <CardHeader>
          <CardTitle className="text-base">Категории</CardTitle>
        </CardHeader>
        <CardContent>
          {level1.length === 0 ? (
            <div className="text-sm text-muted-foreground">Категории отсутствуют</div>
          ) : (
            <div className="space-y-3">
              {level1.map((cat) => {
                const hasLevel2 = (level2ByParent.get(cat.id) ?? []).length > 0;
                const isExpanded = expandedL1.has(cat.id);

                return (
                  <div key={cat.id} className="space-y-2 rounded-md border bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {hasLevel2 ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => toggleL1(cat.id)}
                          >
                            {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          </Button>
                        ) : (
                          <span className="h-8 w-8" />
                        )}
                        <span className="font-medium">{cat.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground"
                        onClick={() => handleDelete(cat.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>

                    {hasLevel2 && isExpanded && renderLevel2(cat.id)}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
