"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, HandCoins, Plus, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { CurrencyChip } from "@/components/currency-chip";
import { MobileSearchSelectOverlay } from "@/components/mobile-search-select-overlay";
import { AssetItemIcon } from "@/components/asset-item-icon";
import { useMobileWizardOpen } from "@/components/mobile-wizard-open-context";
import { ACCENT, ACTIVE_TEXT_DARK, MODAL_BG } from "@/lib/colors";
import { ASSET_TYPES, ITEM_SECTIONS, LIABILITY_TYPES, MOEX_TYPE_CODES, getDefaultPrimaryValueKind, getTodayDateKey } from "@/lib/asset-item-form-constants";
import { API_BASE, createItem, type CurrencyOut, type ItemKind, type ItemOut } from "@/lib/api";
import { formatRubInput, parseRubToCents } from "@/lib/format-rub";
import { assetIconPath } from "@/lib/image-paths";

type WizardStep = "kind" | "section" | "type" | "name" | "currency" | "balance" | "date" | "funding";

const BASE_STEPS: { key: WizardStep; title: string; description: string }[] = [
  { key: "kind", title: "Что добавляем?", description: "Выберите актив или обязательство." },
  { key: "section", title: "К какому разделу относится?", description: "Так будет проще ориентироваться в структуре финансов." },
  { key: "type", title: "Какой это вид?", description: "Выберите подходящий вариант из списка." },
  { key: "name", title: "Как его назвать?", description: "Так вы легко найдёте актив в списке и отчётах." },
  { key: "currency", title: "В какой валюте?", description: "Все суммы по активу будут отображаться в этой валюте." },
  { key: "date", title: "Когда появился актив?", description: "С этой даты начнётся его история в приложении." },
  { key: "balance", title: "Сколько на нём сейчас?", description: "Укажите текущую сумму. Если её пока нет, оставьте ноль." },
];

const FUNDING_STEP: { key: WizardStep; title: string; description: string } = {
  key: "funding",
  title: "Откуда поступили средства?",
  description: "Если не выбрать источник, будет создана транзакция на эту сумму с категорией «Прочие доходы».",
};

const MOBILE_ASSET_TYPES = ASSET_TYPES.filter((type) => !MOEX_TYPE_CODES.includes(type.code) && type.code !== "crypto");

export function MobileAddAssetWizard({
  open,
  onClose,
  onSuccess,
  currencies,
  items,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (item: ItemOut) => void | Promise<void>;
  currencies: CurrencyOut[];
  items: ItemOut[];
}) {
  const mobileWizard = useMobileWizardOpen();
  const setMobileWizardOpen = mobileWizard?.setMobileWizardOpen;
  const [stepIndex, setStepIndex] = useState(0);
  const [kind, setKind] = useState<ItemKind | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [typeCode, setTypeCode] = useState("");
  const [name, setName] = useState("");
  const [currencyCode, setCurrencyCode] = useState("RUB");
  const [showOtherCurrencies, setShowOtherCurrencies] = useState(false);
  const [balance, setBalance] = useState("");
  const [fundingSourceItemId, setFundingSourceItemId] = useState<number | null>(null);
  const [openDate, setOpenDate] = useState(getTodayDateKey());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMobileWizardOpen?.(true);
    setStepIndex(0);
    setError(null);
    setKind(null);
    setSectionId("");
    setTypeCode("");
    setName("");
    setCurrencyCode("RUB");
    setShowOtherCurrencies(false);
    setBalance("");
    setFundingSourceItemId(null);
    setOpenDate(getTodayDateKey());
    return () => setMobileWizardOpen?.(false);
  }, [open, setMobileWizardOpen]);

  const sectionOptions = useMemo(() => ITEM_SECTIONS.filter((section) => section.kind === kind), [kind]);
  const selectedSection = useMemo(() => sectionOptions.find((section) => section.id === sectionId), [sectionId, sectionOptions]);
  const typeOptions = useMemo(() => {
    const source = kind === "LIABILITY" ? LIABILITY_TYPES : MOBILE_ASSET_TYPES;
    return source.filter((type) => selectedSection?.typeCodes.includes(type.code));
  }, [kind, selectedSection]);
  const selectedType = useMemo(() => typeOptions.find((type) => type.code === typeCode), [typeCode, typeOptions]);
  const currencyOptions = useMemo(() => {
    const unique = new Map(currencies.map((currency) => [currency.iso_char_code, currency]));
    if (!unique.has("RUB")) unique.set("RUB", { iso_char_code: "RUB", iso_num_code: "643", nominal: 1, name: "Российский рубль", eng_name: "Russian ruble" });
    const primaryOrder = ["RUB", "USD", "EUR", "CNY", "JPY"];
    return [...unique.values()].sort((a, b) => {
      const aIndex = primaryOrder.indexOf(a.iso_char_code);
      const bIndex = primaryOrder.indexOf(b.iso_char_code);
      if (aIndex >= 0 || bIndex >= 0) return (aIndex < 0 ? primaryOrder.length : aIndex) - (bIndex < 0 ? primaryOrder.length : bIndex);
      return a.iso_char_code.localeCompare(b.iso_char_code);
    });
  }, [currencies]);
  const isLiability = kind === "LIABILITY";
  const openingAmountCents = balance.trim() ? parseRubToCents(balance) : 0;
  const fundingSourceItems = useMemo(
    () => items.filter((item) => item.kind === "ASSET" && !item.archived_at && !item.closed_at && item.currency_code === currencyCode),
    [items, currencyCode]
  );
  const needsFundingSource = Number.isFinite(openingAmountCents) && openingAmountCents > 0 && fundingSourceItems.length > 0;
  const steps = useMemo(() => needsFundingSource ? [...BASE_STEPS, FUNDING_STEP] : BASE_STEPS, [needsFundingSource]);
  const step = steps[stepIndex] ?? BASE_STEPS[0];
  const stepDescription = step.key === "funding" && isLiability
    ? "Если не выбрать источник, будет создана транзакция на эту сумму с категорией «Прочие расходы»."
    : step.description;

  if (!open) return null;

  const isValid = () => {
    if (step.key === "kind") return kind !== null;
    if (step.key === "section") return Boolean(sectionId);
    if (step.key === "type") return Boolean(typeCode);
    if (step.key === "name") return Boolean(name.trim());
    if (step.key === "date") return Boolean(openDate);
    return true;
  };

  const goBack = () => {
    setError(null);
    if (stepIndex === 0) onClose();
    else setStepIndex((current) => current - 1);
  };

  const goNext = async () => {
    if (!isValid()) {
      setError(step.key === "kind" ? "Выберите, что хотите добавить." : step.key === "section" ? "Выберите раздел." : step.key === "type" ? "Выберите вид." : step.key === "name" ? "Введите название." : "Укажите дату.");
      return;
    }
    setError(null);
    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }
    const amount = balance.trim() ? parseRubToCents(balance) : 0;
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Введите сумму от нуля и больше.");
      return;
    }
    setSaving(true);
    try {
      const created = await createItem({
        kind: kind!,
        type_code: typeCode,
        name: name.trim(),
        currency_code: currencyCode,
        open_date: openDate,
        opening_counterparty_item_id: fundingSourceItemId,
        initial_balance_minor: amount,
        primary_value_kind: getDefaultPrimaryValueKind(typeCode, kind!),
      });
      await onSuccess(created);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось добавить актив.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex min-h-[100dvh] flex-col overflow-hidden" style={{ backgroundColor: MODAL_BG }} aria-modal aria-label="Добавление актива">
      <video className="absolute inset-0 h-full w-full object-cover opacity-35" autoPlay muted loop playsInline poster="/bd43aed1425680c9db0527fbe22edf87.jpg">
        <source src="/videos/asset-onboarding.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 transition-colors duration-500" style={{ background: isLiability ? "radial-gradient(circle at 50% 20%, rgba(240, 83, 113, 0.56), transparent 48%), linear-gradient(180deg, rgba(29, 5, 12, 0.34), rgba(0, 0, 0, 0.88))" : "radial-gradient(circle at 50% 20%, rgba(127, 92, 255, 0.52), transparent 48%), linear-gradient(180deg, rgba(0, 0, 0, 0.36), rgba(0, 0, 0, 0.86))" }} />

      <header className="relative z-10 flex items-center justify-between px-3 py-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}>
        <IconButton type="button" aria-label="Назад" onClick={goBack} appearance="default"><ChevronLeft className="size-5" /></IconButton>
        <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.72)" }}>{kind === "LIABILITY" ? "Новое обязательство" : "Новый актив"}</span>
        <IconButton type="button" aria-label="Закрыть" onClick={onClose} appearance="default"><X className="size-5" /></IconButton>
      </header>

      <main className="relative z-10 flex flex-1 flex-col px-6">
        <div className="flex flex-1 flex-col items-center justify-center text-center pb-12">
          <p className="mb-3 text-sm font-medium" style={{ color: "rgba(255,255,255,0.68)" }}>{kind === "LIABILITY" ? "Обязательство" : "Актив"}</p>
          <h1 className="text-[32px] leading-tight font-medium" style={{ color: ACTIVE_TEXT_DARK }}>{step.title}</h1>
          <p className="mt-4 max-w-[280px] text-sm leading-5" style={{ color: "rgba(255,255,255,0.7)" }}>{stepDescription}</p>
        </div>

        <div className="pb-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}>
          {error && <p className="mb-3 text-center text-xs text-red-300">{error}</p>}
          {step.key === "kind" && <div className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none]"><button type="button" onClick={() => { setKind("ASSET"); setSectionId(""); setTypeCode(""); }} className="flex min-w-[78%] snap-center flex-col gap-3 rounded-2xl border p-5 text-left backdrop-blur-sm transition-colors" style={{ borderColor: kind === "ASSET" ? "rgba(180,164,255,0.95)" : "rgba(255,255,255,0.16)", backgroundColor: kind === "ASSET" ? "rgba(127,92,255,0.35)" : "rgba(0,0,0,0.38)" }}><Wallet className="size-8" style={{ color: "#c7bcff" }} /><span className="text-lg font-medium" style={{ color: ACTIVE_TEXT_DARK }}>Актив</span><span className="text-sm" style={{ color: "rgba(255,255,255,0.64)" }}>То, чем вы владеете: деньги, имущество, инвестиции.</span></button><button type="button" onClick={() => { setKind("LIABILITY"); setSectionId(""); setTypeCode(""); }} className="flex min-w-[78%] snap-center flex-col gap-3 rounded-2xl border p-5 text-left backdrop-blur-sm transition-colors" style={{ borderColor: kind === "LIABILITY" ? "rgba(255,157,176,0.95)" : "rgba(255,255,255,0.16)", backgroundColor: kind === "LIABILITY" ? "rgba(182,45,77,0.36)" : "rgba(0,0,0,0.38)" }}><HandCoins className="size-8" style={{ color: "#ffb2c1" }} /><span className="text-lg font-medium" style={{ color: ACTIVE_TEXT_DARK }}>Обязательство</span><span className="text-sm" style={{ color: "rgba(255,255,255,0.64)" }}>То, что вы должны: кредиты, долги, платежи.</span></button></div>}
          {step.key === "section" && <div className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none]">{sectionOptions.map((section) => <button key={section.id} type="button" onClick={(event) => { setSectionId(section.id); setTypeCode(""); event.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }); }} className="flex min-w-[78%] snap-center items-center justify-center px-5 text-center text-lg font-medium transition-opacity" style={{ minHeight: 132, color: sectionId === section.id ? ACTIVE_TEXT_DARK : "rgba(255,255,255,0.42)", opacity: sectionId && sectionId !== section.id ? 0.45 : 1 }}>{section.label}</button>)}</div>}
          {step.key === "type" && <div className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none]">{typeOptions.map((type) => { const iconCode = type.code === "bank_card_debit" || type.code === "bank_card_credit" ? "bank_card" : type.code; return <button key={type.code} type="button" onClick={(event) => { setTypeCode(type.code); event.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }); }} className="flex min-w-[78%] snap-center flex-col items-center justify-center gap-4 px-5 text-center text-lg font-medium transition-opacity" style={{ minHeight: 176, color: typeCode === type.code ? ACTIVE_TEXT_DARK : "rgba(255,255,255,0.42)", opacity: typeCode && typeCode !== type.code ? 0.45 : 1 }}><Image src={assetIconPath(iconCode, "png")!} alt="" width={80} height={80} className="size-20 object-contain" /><span>{type.label}</span></button>; })}</div>}
          {step.key === "name" && <input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void goNext(); }} placeholder={selectedType ? `Например, ${selectedType.label}` : isLiability ? "Название обязательства" : "Название актива"} className="h-14 w-full rounded-2xl border border-sidebar-border/70 bg-sidebar/70 px-4 text-base shadow-[0_10px_30px_rgba(0,0,0,0.28)] outline-none placeholder:text-white/45 backdrop-blur-xl supports-[backdrop-filter]:bg-sidebar/55" style={{ color: ACTIVE_TEXT_DARK }} />}
          {step.key === "currency" && <div className="rounded-2xl border border-sidebar-border/70 bg-sidebar/70 px-2 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl supports-[backdrop-filter]:bg-sidebar/55"><div className="grid max-h-72 grid-cols-5 gap-x-2 gap-y-2 overflow-y-auto px-2 py-3">{(showOtherCurrencies ? currencyOptions : currencyOptions.slice(0, 5)).map((currency) => { const selected = currencyCode === currency.iso_char_code; return <button key={currency.iso_char_code} type="button" onClick={() => setCurrencyCode(currency.iso_char_code)} aria-label={`Выбрать ${currency.iso_char_code}`} className="flex min-h-16 items-center justify-center rounded-[9px] transition-transform duration-200"><CurrencyChip code={currency.iso_char_code} className={selected ? "scale-150 shadow-lg" : "scale-100 opacity-75"} /></button>; })}</div>{currencyOptions.length > 5 && !showOtherCurrencies && <button type="button" onClick={() => setShowOtherCurrencies(true)} className="mt-2 w-full text-center text-sm font-medium" style={{ color: "rgba(255,255,255,0.76)" }}>Другие валюты</button>}</div>}
          {step.key === "balance" && <input autoFocus inputMode="decimal" value={balance} onChange={(event) => setBalance(formatRubInput(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") void goNext(); }} placeholder="0" className="h-14 w-full rounded-2xl border border-sidebar-border/70 bg-sidebar/70 px-4 text-base shadow-[0_10px_30px_rgba(0,0,0,0.28)] outline-none placeholder:text-white/45 backdrop-blur-xl supports-[backdrop-filter]:bg-sidebar/55" style={{ color: ACTIVE_TEXT_DARK }} />}
          {step.key === "date" && <input autoFocus type="date" value={openDate} onChange={(event) => setOpenDate(event.target.value)} className="h-14 w-full rounded-2xl border border-sidebar-border/70 bg-sidebar/70 px-4 text-base shadow-[0_10px_30px_rgba(0,0,0,0.28)] outline-none backdrop-blur-xl supports-[backdrop-filter]:bg-sidebar/55" style={{ color: ACTIVE_TEXT_DARK }} />}
          {step.key === "funding" && <div className="flex items-center gap-2"><div className="min-w-0 flex-1"><MobileSearchSelectOverlay value={fundingSourceItemId != null ? fundingSourceItems.find((item) => item.id === fundingSourceItemId) ?? null : null} options={fundingSourceItems} getOptionLabel={(item) => item.name} getOptionKey={(item) => item.id} onSelect={(item) => setFundingSourceItemId(item.id)} placeholder="Добавить" searchPlaceholder="Поиск актива" ariaLabel="Добавить источник средств" useMobileBarSurface triggerClassName="min-h-14 !rounded-xl !border !border-sidebar-border/70 !bg-sidebar/70 !shadow-[0_10px_30px_rgba(0,0,0,0.28)] !backdrop-blur-xl supports-[backdrop-filter]:!bg-sidebar/55" renderEmptyTriggerContent={() => <span className="flex w-full items-center justify-center gap-2 font-medium" style={{ color: ACTIVE_TEXT_DARK }}><Plus className="size-5" />Добавить</span>} renderTriggerContent={(item) => <><AssetItemIcon item={item} counterparty={null} apiBase={API_BASE} size={28} /><span className="truncate font-medium">{item.name}</span><CurrencyChip code={item.currency_code} /></>} renderOption={(item) => <div className="flex min-h-14 items-center gap-3 rounded-xl px-4" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: ACTIVE_TEXT_DARK }}><AssetItemIcon item={item} counterparty={null} apiBase={API_BASE} size={30} /><span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span><CurrencyChip code={item.currency_code} /></div>} /></div>{fundingSourceItemId !== null && <IconButton type="button" aria-label="Убрать источник средств" onClick={() => setFundingSourceItemId(null)} appearance="default" className="size-12 shrink-0"><X className="size-5" /></IconButton>}</div>}
          <Button type="button" onClick={() => void goNext()} disabled={saving} className="mt-3 h-14 w-full rounded-2xl border-0 text-base font-medium" style={{ backgroundColor: isLiability ? "#D94C68" : ACCENT }}>{saving ? "Добавляем..." : stepIndex === steps.length - 1 ? isLiability ? "Добавить обязательство" : "Добавить актив" : "Продолжить"}</Button>
          <div className="mt-5 flex h-2 items-center justify-center gap-1.5" aria-label={`Шаг ${stepIndex + 1} из ${steps.length}`}>
            {steps.map((item, index) => <span key={item.key} className={`block rounded-full transition-all duration-300 ${index === stepIndex ? "h-1.5 w-8" : "size-1.5"}`} style={{ backgroundColor: index === stepIndex ? (isLiability ? "#ff9eb2" : "#c7bcff") : "rgba(255,255,255,0.38)" }} />)}
          </div>
        </div>
      </main>
    </div>
  );
}
