"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { AuthInput } from "@/components/ui/auth-input";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ACCENT_FILL_LIGHT,
  ACCENT_FILL_MEDIUM,
  ACCENT2,
  ACTIVE_TEXT_DARK,
  PLACEHOLDER_COLOR_DARK,
} from "@/lib/colors";
import { cn } from "@/lib/utils";
import { CurrencyChip } from "@/components/currency-chip";

interface FormFieldProps {
  label?: string;
  /** Текст всплывающей подсказки; рядом с названием показывается иконка (i) */
  labelHint?: string;
  required?: boolean;
  error?: string;
  className?: string;
  /** На мобильной: не показывать подпись сверху, показать icon слева от поля; placeholder в поле задаётся в дочернем компоненте. */
  inlineLabel?: boolean;
  /** Иконка слева от поля (при inlineLabel). */
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function FormField({
  label,
  labelHint,
  required,
  error,
  className,
  inlineLabel = false,
  icon,
  children,
}: FormFieldProps) {
  const showLabelAbove = label && !inlineLabel;

  return (
    <div className={cn("grid min-w-0", showLabelAbove ? "gap-2" : "gap-0", className)}>
      {showLabelAbove ? (
        <Label style={{ color: ACTIVE_TEXT_DARK }} className="flex min-h-6 flex-wrap items-center gap-x-1.5 gap-y-0">
          <span>{label}{required && <span style={{ color: "#FB4C4F" }}> *</span>}</span>
          {labelHint ? (
            <Tooltip content={labelHint} side="top" className="inline-flex items-center">
              <span
                className="inline-flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 cursor-help"
                style={{ color: PLACEHOLDER_COLOR_DARK }}
                tabIndex={0}
              >
                <Info className="w-4 h-4" />
              </span>
            </Tooltip>
          ) : null}
        </Label>
      ) : null}
      {inlineLabel && icon ? (
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center" style={{ color: PLACEHOLDER_COLOR_DARK }}>
            {icon}
          </span>
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      ) : (
        children
      )}
      {error && (
        <p className="text-xs" style={{ color: "#FB4C4F" }}>
          {error}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps extends Omit<React.ComponentProps<"input">, "prefix"> {
  label?: string;
  labelHint?: string;
  required?: boolean;
  error?: string;
  prefix?: React.ReactNode;
  /** Код валюты: слева от поля показывается чип валюты, из label валюту не добавлять. */
  currencyCode?: string | null;
}

/** Классы для префикса-чипа валюты внутри поля (чип слева, затем ввод). */
const CURRENCY_PREFIX_LEFT = "left-3";
const CURRENCY_PREFIX_PL = "pl-14";
const CURRENCY_PREFIX_CONTAINER = "flex items-center shrink-0 pointer-events-none";

export function TextField({ 
  label, 
  labelHint,
  required, 
  error, 
  prefix,
  currencyCode,
  className,
  ...props 
}: TextFieldProps) {
  const effectivePrefix = currencyCode ? <CurrencyChip code={currencyCode} className="shrink-0" /> : prefix;
  const prefixProps = currencyCode
    ? {
        prefix: effectivePrefix,
        prefixLeftClass: CURRENCY_PREFIX_LEFT,
        prefixPlClass: CURRENCY_PREFIX_PL,
        prefixContainerClass: CURRENCY_PREFIX_CONTAINER,
      }
    : effectivePrefix ? { prefix: effectivePrefix } : {};

  return (
    <FormField label={label ?? ""} labelHint={labelHint} required={required} error={error}>
      <div className="relative [&_div.relative.flex.items-center]:h-10 [&_div.relative.flex.items-center]:min-h-[40px] [&_input]:text-sm [&_input]:font-normal">
        <AuthInput
          {...props}
          {...prefixProps}
          className={className}
        />
      </div>
    </FormField>
  );
}

interface DateFieldProps extends Omit<React.ComponentProps<"input">, "type"> {
  label: string;
  required?: boolean;
  error?: string;
}

export function DateField({ 
  label, 
  required, 
  error, 
  className,
  ...props 
}: DateFieldProps) {
  const fieldContent = (
    <div className="relative [&_div.relative.flex.items-center]:h-10 [&_div.relative.flex.items-center]:min-h-[40px] [&_input]:text-sm [&_input]:font-normal">
      <AuthInput
        type="date"
        {...props}
        className={className}
      />
    </div>
  );

  if (!label) {
    return (
      <div className="grid gap-2">
        {fieldContent}
        {error && (
          <p className="text-xs" style={{ color: "#FB4C4F" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <FormField label={label} required={required} error={error}>
      {fieldContent}
    </FormField>
  );
}

interface SelectFieldOption {
  value: string;
  label: React.ReactNode;
}

interface SelectFieldProps {
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectFieldOption[];
  placeholder?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}

export function SelectField({
  label = "",
  value,
  onValueChange,
  options,
  placeholder = "Выберите...",
  required,
  error,
  disabled,
}: SelectFieldProps) {
  const [isFocused, setIsFocused] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Background color based on state
  const backgroundColor = isFocused || isHovered || isOpen ? ACCENT_FILL_MEDIUM : ACCENT_FILL_LIGHT;
  
  // Border color based on state (focus: ACCENT2)
  const borderColor = isFocused || isOpen ? ACCENT2 : ACCENT_FILL_MEDIUM;
  
  // Bottom stroke as inset (inside); drop shadow when focused (ACCENT2)
  const insetBottom = `inset 0 -2px 0 0 ${borderColor}`;
  const boxShadow = isFocused || isOpen
    ? `${insetBottom}, 0 8px 25px -8px ${ACCENT2}`
    : insetBottom;

  return (
    <FormField label={label} required={required} error={error}>
      <div 
        className="relative w-full"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Container with background, border and shadow - matching AuthInput style */}
        <div 
          className="relative rounded-lg transition-all duration-200 box-border"
          style={{
            backgroundColor,
            borderRadius: "8px",
            boxShadow,
          }}
        >
          {/* Inner container: h-10 to match TextField/AuthInput height; whole area opens select */}
          <div
            className="relative flex items-center px-4 h-10 z-10 cursor-pointer"
            onClick={(e) => {
              if (disabled) return;
              if (!triggerRef.current?.contains(e.target as Node)) {
                triggerRef.current?.click();
              }
            }}
          >
            <Select 
              value={value} 
              onValueChange={onValueChange} 
              disabled={disabled}
              onOpenChange={(open) => {
                setIsOpen(open);
                setIsFocused(open);
              }}
            >
              <SelectTrigger 
                ref={triggerRef}
                className="!w-full !h-auto !min-h-0 !border-0 !bg-transparent dark:!bg-transparent dark:hover:!bg-transparent !shadow-none !p-0 !px-0 !py-0 !rounded-none !focus:ring-0 !focus:outline-none !data-[state=open]:ring-0 [&_[data-slot=select-value]]:line-clamp-1 [&_[data-slot=select-value]]:truncate"
                style={{
                  color: value ? ACTIVE_TEXT_DARK : PLACEHOLDER_COLOR_DARK,
                  backgroundColor: "transparent",
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent 
                className="bg-[#25243F] border-0"
                style={{
                  backgroundColor: "#25243F",
                }}
              >
                {options.map((option) => (
                  <SelectItem 
                    key={option.value} 
                    value={option.value}
                    className="text-white hover:bg-[rgba(108,93,215,0.22)] focus:bg-[rgba(108,93,215,0.22)]"
                    style={{
                      color: ACTIVE_TEXT_DARK,
                    }}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </FormField>
  );
}
