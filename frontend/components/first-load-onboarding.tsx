"use client";

import { useCallback, useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { useAccountingStart } from "@/components/accounting-start-context";
import {
  ImportHistoryModalContent,
  type ImportSourceKey,
} from "@/components/import-history-modal-content";
import { ImportAccountsOperationsModal } from "@/components/import-accounts-operations-modal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { DateField } from "@/components/ui/form-field";
import {
  ACTIVE_TEXT_DARK,
  ACCENT,
  ACCENT2,
  MODAL_BG,
  PLACEHOLDER_COLOR_DARK,
} from "@/lib/colors";
import { cn } from "@/lib/utils";

// Изображения: положите в public/illustrations/
// Модальное 1: onboarding-welcome.png (кольца/диски)
// Модальное 2: onboarding-intro.png (фиолетовые волны)
const IMAGE_WELCOME = "/illustrations/onboarding-welcome.png";
const IMAGE_INTRO = "/illustrations/onboarding-intro.png";

function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

type Step = 1 | 2 | 3 | 4;

export function FirstLoadOnboarding() {
  const router = useRouter();
  const { accountingStartDate, setAccountingStartDate } = useAccountingStart();
  const [step, setStep] = useState<Step>(1);
  const [importStepSkipped, setImportStepSkipped] = useState(false);
  const [importSource, setImportSource] = useState<ImportSourceKey>(null);
  const [choiceToday, setChoiceToday] = useState(true);
  const [customDate, setCustomDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [importServiceModalOpen, setImportServiceModalOpen] = useState(false);

  const todayKey = useMemo(() => getTodayDateKey(), []);
  const displayToday = formatDisplayDate(todayKey);

  const goToStep2 = useCallback(() => setStep(2), []);
  const goToStep3 = useCallback(() => {
    setImportStepSkipped(false);
    setStep(3);
  }, []);

  const onStartTour = useCallback(() => {
    // Заглушка: «Начать тур» пока не работает
  }, []);

  const onNext = useCallback(async () => {
    setLocalError(null);
    const dateToSave = choiceToday ? todayKey : customDate.trim();
    if (!dateToSave) {
      setLocalError("Укажите дату начала учета.");
      return;
    }
    if (dateToSave > todayKey) {
      setLocalError("Дата начала учета не может быть позже сегодняшней даты.");
      return;
    }
    setSaving(true);
    try {
      await setAccountingStartDate(dateToSave);
      router.push("/assets");
    } catch {
      setLocalError("Не удалось сохранить дату.");
    } finally {
      setSaving(false);
    }
  }, [choiceToday, todayKey, customDate, setAccountingStartDate, router]);

  const textStyle = useMemo(
    () => ({ color: ACTIVE_TEXT_DARK } as const),
    []
  );
  const placeholderStyle = useMemo(
    () => ({ color: PLACEHOLDER_COLOR_DARK } as const),
    []
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen === false && !accountingStartDate) {
        setStep(4);
        return;
      }
      setOpen(nextOpen);
    },
    [accountingStartDate]
  );

  const onImportLater = useCallback(() => {
    setImportStepSkipped(true);
    setStep(4);
  }, []);

  const onStartImport = useCallback(() => {
    if (importSource) setImportServiceModalOpen(true);
  }, [importSource]);

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={true}
        title="Первоначальная настройка"
        className={cn(
          "w-full max-w-[calc(100%-2rem)] sm:max-w-xl md:max-w-2xl lg:max-w-4xl xl:max-w-5xl h-[920px] max-h-[min(920px,100dvh)] p-0 gap-0 overflow-hidden flex flex-col",
          "bg-black border-0 rounded-[9px]"
        )}
      >
        {/* Шаг 1: Добро пожаловать */}
        {step === 1 && (
          <div
            key="step1"
            className="grid grid-cols-1 md:grid-cols-2 w-full h-full min-h-0 animate-in fade-in duration-300"
          >
            <div className="flex flex-col justify-center gap-6 px-8 py-10 md:pl-12 md:pr-8 order-2 md:order-1 min-h-0">
              <h1
                className="text-[48px] font-semibold max-w-md"
                style={{ ...textStyle, lineHeight: 1.125 }}
              >
                Добро пожаловать!
              </h1>
              <p
                className="text-[18px] font-normal max-w-md"
                style={{ ...textStyle, lineHeight: 1.125 }}
              >
                ПРОСТОФИН — это полная картина Ваших финансов. Счета, имущество,
                инвестиции, кредиты — все в одном месте!
              </p>
              <div className="pt-2">
                <Button
                  variant="authPrimary"
                  className="w-full h-12 text-base font-bold rounded-lg border-0 min-w-[140px]"
                  style={
                    {
                      "--auth-primary-bg":
                        "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                      "--auth-primary-bg-hover":
                        "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                    } as CSSProperties
                  }
                  onClick={goToStep2}
                >
                  Начать
                </Button>
              </div>
            </div>
            <div className="relative w-full h-full min-h-[280px] md:min-h-full order-1 md:order-2">
              <Image
                src={IMAGE_WELCOME}
                alt=""
                fill
                className="object-cover object-center"
                sizes="(max-width: 768px) 100vw, 50vw"
                unoptimized
              />
            </div>
          </div>
        )}

        {/* Шаг 2: Знакомство с приложением */}
        {step === 2 && (
          <div
            key="step2"
            className="grid grid-cols-1 md:grid-cols-2 w-full h-full min-h-0 animate-in fade-in duration-300"
          >
            <div className="relative w-full h-full min-h-[240px] md:min-h-full order-1">
              <Image
                src={IMAGE_INTRO}
                alt=""
                fill
                className="object-cover object-center"
                sizes="(max-width: 768px) 100vw, 50vw"
                unoptimized
              />
            </div>
            <div className="flex flex-col justify-center gap-6 px-8 py-10 md:pl-8 md:pr-12 order-2 min-h-0 text-right">
              <h1
                className="text-[48px] font-semibold max-w-md ml-auto"
                style={{ ...textStyle, lineHeight: 1.125 }}
              >
                Знакомство с приложением
              </h1>
              <p
                className="text-[18px] font-normal max-w-md ml-auto"
                style={{ ...textStyle, lineHeight: 1.125 }}
              >
                Мы подготовили для Вас небольшой тур по приложению, чтобы
                показать, какие удобные инструменты будут в Вашем распоряжении
              </p>
              <div className="flex flex-wrap gap-3 pt-2 justify-end">
                <Button
                  variant="ghost"
                  className="h-auto py-2 px-0 rounded-none border-0 bg-transparent font-medium hover:!bg-transparent dark:hover:!bg-transparent hover:no-underline"
                  style={{ color: ACCENT }}
                  onClick={goToStep3}
                >
                  Позднее
                </Button>
                <Button
                  variant="authPrimary"
                  className="h-12 text-base font-bold rounded-lg border-0 px-8"
                  style={
                    {
                      "--auth-primary-bg":
                        "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                      "--auth-primary-bg-hover":
                        "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                    } as CSSProperties
                  }
                  onClick={onStartTour}
                >
                  Начать тур
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Шаг 3: Импорт истории из других приложений */}
        {step === 3 && (
          <ImportHistoryModalContent
            key="step3"
            selectedSource={importSource}
            onSelectSource={setImportSource}
            onLater={onImportLater}
            onStartImport={onStartImport}
          />
        )}

        {/* Шаг 4: Выбор даты начала учета (только если импорт пропущен) */}
        {step === 4 && importStepSkipped && (
          <div
            key="step4"
            className="flex flex-col w-full h-full min-h-0 px-6 py-8 sm:px-10 sm:py-10 animate-in fade-in duration-300"
          >
            <p
              className="text-[32px] font-medium leading-snug mb-6 max-w-2xl shrink-0"
              style={textStyle}
            >
              Для начала нужно определиться с{" "}
              <span style={{ color: ACCENT }}>датой начала учета</span>
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 flex-1 min-h-0 mb-6">
              {/* Сегодня */}
              <button
                type="button"
                onClick={() => setChoiceToday(true)}
                className="rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all border-0 border-b-[4px] border-solid min-h-0"
                style={{
                  backgroundColor: choiceToday ? MODAL_BG : "transparent",
                  borderBottomColor: choiceToday ? ACCENT2 : "transparent",
                  borderRadius: "9px",
                  boxShadow: choiceToday
                    ? `inset 0 -26px 41px -28px ${ACCENT2}, inset 0 -2px 0 0 ${ACCENT2}`
                    : undefined,
                }}
              >
                <div
                  className="text-[48px] font-semibold leading-tight mb-2"
                  style={textStyle}
                >
                  Сегодня
                </div>
                <div
                  className="text-[32px] font-medium mb-3"
                  style={textStyle}
                >
                  {displayToday}
                </div>
                <p
                  className="text-[18px] font-normal mb-2 max-w-sm"
                  style={textStyle}
                >
                  Подойдет тем, кто впервые начинает учет своих финансов
                </p>
                <p
                  className="text-[14px] font-normal max-w-sm"
                  style={placeholderStyle}
                >
                  Остатки по счетам, стоимость имущества, задолженность по
                  кредитам укажете на сегодняшнюю дату. История доходов и расходов
                  начнется с сегодняшнего дня
                </p>
              </button>

              {/* Другая дата */}
              <button
                type="button"
                onClick={() => setChoiceToday(false)}
                className="rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all border-0 border-b-[4px] border-solid min-h-0"
                style={{
                  backgroundColor: !choiceToday ? MODAL_BG : "transparent",
                  borderBottomColor: !choiceToday ? ACCENT2 : "transparent",
                  borderRadius: "9px",
                  boxShadow: !choiceToday
                    ? `inset 0 -26px 41px -28px ${ACCENT2}, inset 0 -2px 0 0 ${ACCENT2}`
                    : undefined,
                }}
              >
                <div
                  className="text-[48px] font-semibold leading-tight mb-4"
                  style={textStyle}
                >
                  Другая дата
                </div>
                <div
                  className="mb-4 w-full max-w-[240px]"
                  onClick={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <DateField
                    label=""
                    value={customDate}
                    max={todayKey}
                    onChange={(e) => setCustomDate(e.target.value)}
                  />
                </div>
                <p
                  className="text-[18px] font-normal mb-2 max-w-sm"
                  style={textStyle}
                >
                  Подойдет тем, кто уже вел ранее учет финансов и хочет перейти на
                  ПРОСТОФИН
                </p>
                <p
                  className="text-[14px] font-normal max-w-sm"
                  style={placeholderStyle}
                >
                  Остатки по счетам, стоимость имущества, задолженность по кредитам
                  нужно будет указать на выбранную дату. Доходы и расходы также
                  нужно будет внести с этой даты (можно сделать через импорт
                  выписок)
                </p>
              </button>
            </div>

            {localError && (
              <p className="text-sm text-red-400 mb-4 shrink-0">{localError}</p>
            )}

            <div className="flex justify-end shrink-0">
              <Button
                variant="authPrimary"
                className="h-12 text-base font-bold rounded-lg border-0 px-8"
                style={
                  {
                    "--auth-primary-bg":
                      "linear-gradient(135deg, #483BA6 0%, #6C5DD7 57%, #6C5DD7 79%, #9487F3 100%)",
                    "--auth-primary-bg-hover":
                      "linear-gradient(315deg, #9487F3 0%, #6C5DD7 57%, #6C5DD7 79%, #483BA6 100%)",
                  } as CSSProperties
                }
                onClick={onNext}
                disabled={saving}
              >
                {saving ? "Сохранение…" : "Далее"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    <ImportAccountsOperationsModal
      open={importServiceModalOpen}
      onOpenChange={setImportServiceModalOpen}
      importSource={importSource ?? undefined}
      onFinish={() => {
        setImportStepSkipped(true);
        setStep(4);
      }}
    />
    </>
  );
}
