"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
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

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}

export function FormField({ label, required, error, children }: FormFieldProps) {
  return (
    <div className="grid gap-2">
      <Label style={{ color: ACTIVE_TEXT_DARK }}>
        {label}
        {required && <span style={{ color: "#FB4C4F" }}> *</span>}
      </Label>
      {children}
      {error && (
        <p className="text-xs" style={{ color: "#FB4C4F" }}>
          {error}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps extends Omit<React.ComponentProps<"input">, "prefix"> {
  label: string;
  required?: boolean;
  error?: string;
  prefix?: React.ReactNode;
}

export function TextField({ 
  label, 
  required, 
  error, 
  prefix,
  className,
  ...props 
}: TextFieldProps) {
  return (
    <FormField label={label} required={required} error={error}>
      <div className="relative [&_div.relative.flex.items-center]:h-10 [&_div.relative.flex.items-center]:min-h-[40px] [&_input]:text-sm [&_input]:font-normal">
        <AuthInput
          {...props}
          prefix={prefix}
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
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectFieldOption[];
  placeholder?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}

export function SelectField({
  label,
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
          {/* Inner container */}
          <div className="relative flex items-center px-4 h-10 z-10">
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
                className="!w-full !h-auto !border-0 !bg-transparent dark:!bg-transparent dark:hover:!bg-transparent !shadow-none !p-0 !px-0 !py-0 !rounded-none !focus:ring-0 !focus:outline-none !data-[state=open]:ring-0"
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
