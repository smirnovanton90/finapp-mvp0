"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers3, Plus, Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const [newL1, setNewL1] = useState("");
  const [newL2Name, setNewL2Name] = useState("");
  const [newL2Parent, setNewL2Parent] = useState<number | null>(null);
  const [newL3Name, setNewL3Name] = useState("");
  const [newL3Parent, setNewL3Parent] = useState<number | null>(null);

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

  async function handleCreate(
    payload: Parameters<typeof createCategory>[0],
    reset: () => void
  ) {
    setError(null);
    try {
      await createCategory(payload);
      reset();
      await loadCategories();
    } catch (e: any) {
      setError(e?.message ?? "Не удалось создать категорию");
    }
  }

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

  return (
    <main className="p-6">
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-violet-100">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Уровень 1</span>
              <span className="text-xs font-normal text-muted-foreground">Основные группы</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate(
                  { name: newL1, level: 1 },
                  () => setNewL1("")
                );
              }}
            >
              <Input
                value={newL1}
                onChange={(e) => setNewL1(e.target.value)}
                placeholder="Новая категория"
              />
              <Button type="submit" disabled={loading}>
                <Plus className="mr-1 h-4 w-4" />
                Добавить
              </Button>
            </form>

            <div className="divide-y rounded-md border">
              {level1.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between px-3 py-2">
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
          </CardContent>
        </Card>

        <Card className="border-violet-100">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Уровень 2</span>
              <span className="text-xs font-normal text-muted-foreground">Привязаны к уровню 1</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newL2Parent) {
                  setError("Выберите категорию первого уровня");
                  return;
                }
                handleCreate(
                  { name: newL2Name, level: 2, parent_id: newL2Parent },
                  () => {
                    setNewL2Name("");
                    setNewL2Parent(null);
                  }
                );
              }}
            >
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Категория 1 уровня</Label>
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

              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Название категории</Label>
                <Input
                  value={newL2Name}
                  onChange={(e) => setNewL2Name(e.target.value)}
                  placeholder="Новая подкатегория"
                />
              </div>

              <Button type="submit" disabled={loading} className="justify-self-start">
                <Plus className="mr-1 h-4 w-4" />
                Добавить
              </Button>
            </form>

            <div className="space-y-3">
              {level1.map((parent) => (
                <div key={parent.id} className="rounded-md border">
                  <div className="flex items-center justify-between bg-muted/50 px-3 py-2 text-sm font-medium">
                    {parent.name}
                  </div>
                  {level2ByParent.get(parent.id)?.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between border-t px-3 py-2"
                    >
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
                  )) || (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Подкатегорий нет</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-violet-100">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Уровень 3</span>
              <span className="text-xs font-normal text-muted-foreground">Привязаны к уровню 2</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newL3Parent) {
                  setError("Выберите категорию второго уровня");
                  return;
                }
                handleCreate(
                  { name: newL3Name, level: 3, parent_id: newL3Parent },
                  () => {
                    setNewL3Name("");
                    setNewL3Parent(null);
                  }
                );
              }}
            >
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Категория 1 уровня</Label>
                <Select
                  value={(() => {
                    if (!newL3Parent) return "";
                    const parent = level2.find((c) => c.id === newL3Parent);
                    return parent?.parent_id ? String(parent.parent_id) : "";
                  })()}
                  onValueChange={(val) => {
                    const l2 = level2ByParent.get(Number(val));
                    setNewL3Parent(l2?.[0]?.id ?? null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите категорию уровня 1" />
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

              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Категория 2 уровня</Label>
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
                        <div className="px-3 py-1 text-xs font-medium text-muted-foreground">
                          {parent.name}
                        </div>
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

              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Название категории</Label>
                <Input
                  value={newL3Name}
                  onChange={(e) => setNewL3Name(e.target.value)}
                  placeholder="Новая категория 3 уровня"
                />
              </div>

              <Button type="submit" disabled={loading} className="justify-self-start">
                <Plus className="mr-1 h-4 w-4" />
                Добавить
              </Button>
            </form>

            <div className="space-y-3">
              {level2.map((parent) => (
                <div key={parent.id} className="rounded-md border">
                  <div className="flex items-center justify-between bg-muted/50 px-3 py-2 text-sm font-medium">
                    <span className="truncate">{parent.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {level1.find((l1) => l1.id === parent.parent_id)?.name || ""}
                    </span>
                  </div>
                  {level3ByParent.get(parent.id)?.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between border-t px-3 py-2"
                    >
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
                  )) || (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Подкатегорий нет</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
