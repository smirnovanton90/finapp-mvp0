"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "./input";
import { useTheme } from "@/components/theme-provider";
import { ACCENT2, ACCENT_FILL_LIGHT, ACCENT_FILL_MEDIUM, PLACEHOLDER_COLOR_DARK, PLACEHOLDER_COLOR_LIGHT, ACTIVE_TEXT_DARK } from "@/lib/colors";

interface AuthInputProps extends Omit<React.ComponentProps<"input">, "prefix"> {
  icon?: "user" | "lock";
  gradientDirection?: "left-to-right" | "right-to-left";
  /** Optional left adornment (e.g. icon, logo). When set, inner container gets pl-11. */
  prefix?: React.ReactNode;
  /** Override prefix icon position (e.g. "left-2"). Default "left-4". */
  prefixLeftClass?: string;
  /** Override inner container padding-left when prefix (e.g. "pl-12"). Default "pl-11". */
  prefixPlClass?: string;
}

function AuthInput({ 
  className, 
  icon = "user",
  gradientDirection = "left-to-right",
  prefix,
  prefixLeftClass = "left-4",
  prefixPlClass = "pl-11",
  ...props 
}: AuthInputProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [isFocused, setIsFocused] = React.useState(false);
  const [hasValue, setHasValue] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  
  const isPasswordField = props.type === "password";

  React.useEffect(() => {
    if (props.value !== undefined) {
      const valueStr = String(props.value);
      setHasValue(valueStr.length > 0 && valueStr !== "");
    } else if (inputRef.current) {
      // Also check the actual input value for date inputs
      setHasValue(inputRef.current.value.length > 0);
    }
  }, [props.value]);

  // Background color based on state
  const backgroundColor = isFocused || isHovered ? ACCENT_FILL_MEDIUM : ACCENT_FILL_LIGHT;
  
  // Border color based on state (focus: ACCENT2)
  const borderColor = isFocused ? ACCENT2 : ACCENT_FILL_MEDIUM;
  
  // Bottom stroke as inset (inside); drop shadow when focused (ACCENT2)
  const insetBottom = `inset 0 -2px 0 0 ${borderColor}`;
  const boxShadow = isFocused 
    ? `${insetBottom}, 0 8px 25px -8px ${ACCENT2}`
    : insetBottom;

  const UserIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <circle 
        cx="10" 
        cy="8.33333" 
        r="4.16667" 
        stroke="#8E81E6" 
        strokeOpacity={isFocused || hasValue ? "0.5" : "0.3"} 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="transition-opacity duration-200"
      />
      <path 
        d="M5 15.8333C5 13.7319 6.73186 12 8.83333 12H11.1667C13.2681 12 15 13.7319 15 15.8333" 
        stroke="#8E81E6" 
        strokeOpacity={isFocused || hasValue ? "0.5" : "0.3"} 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="transition-opacity duration-200"
      />
    </svg>
  );

  const LockIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <rect 
        x="5" 
        y="9.16667" 
        width="10" 
        height="6.66667" 
        rx="1" 
        stroke="#8E81E6" 
        strokeOpacity={isFocused || hasValue ? "0.5" : "0.3"} 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="transition-opacity duration-200"
      />
      <path 
        d="M5 9.16667V6.66667C5 4.00761 7.00761 2 9.66667 2H10.3333C12.9924 2 15 4.00761 15 6.66667V9.16667" 
        stroke="#8E81E6" 
        strokeOpacity={isFocused || hasValue ? "0.5" : "0.3"} 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="transition-opacity duration-200"
      />
    </svg>
  );

  return (
    <div 
      className="relative w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Container with background, border and shadow */}
      <div 
        className="relative rounded-lg transition-all duration-200 box-border"
        style={{
          backgroundColor,
          borderRadius: "8px",
          boxShadow,
        }}
      >
        {/* Inner container */}
        <div className={cn("relative flex items-center rounded-lg px-4 h-10 z-10", prefix && prefixPlClass)}>
          {prefix && (
            <div className={cn("absolute flex h-6 w-6 items-center justify-center shrink-0 pointer-events-none", prefixLeftClass)}>
              {prefix}
            </div>
          )}
          {/* Input */}
          <input
            {...props}
            ref={inputRef}
            type={isPasswordField && showPassword ? "text" : props.type}
            style={{
              ...(isDark
                ? {
                    ["--auth-placeholder-color" as any]: PLACEHOLDER_COLOR_DARK,
                    color: props.style?.color || (hasValue ? ACTIVE_TEXT_DARK : PLACEHOLDER_COLOR_DARK),
                  } as React.CSSProperties
                : ({
                    ["--auth-placeholder-color" as any]: PLACEHOLDER_COLOR_LIGHT,
                  } as React.CSSProperties)),
              ...(props.style || {}),
            }}
            className={cn(
              "auth-input flex-1 bg-transparent border-0 p-0 h-auto text-base",
              isDark
                ? ""
                : "text-foreground",
              "focus-visible:ring-0 focus-visible:outline-none focus-visible:border-0",
              "transition-all duration-200",
              isPasswordField && "pr-8",
              className
            )}
            onFocus={(e) => {
              setIsFocused(true);
              // Check value on focus for date inputs
              if (props.type === "date" && e.currentTarget.value) {
                setHasValue(true);
              }
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              // Check value on blur for date inputs
              if (props.type === "date") {
                setHasValue(e.currentTarget.value.length > 0);
              }
              props.onBlur?.(e);
            }}
            onChange={(e) => {
              // Update hasValue when input changes
              const newValue = e.target.value;
              setHasValue(newValue.length > 0);
              props.onChange?.(e);
            }}
          />
          
          {/* Show/Hide Password Icon */}
          {isPasswordField && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 flex items-center justify-center w-5 h-5 text-[#8E81E6] hover:text-[#CFCFD6] transition-colors duration-200 z-20 cursor-pointer"
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2.5 2.5L17.5 17.5M8.33333 8.33333L11.6667 11.6667M13.3333 13.3333L10 10M6.66667 6.66667L2.5 2.5M17.5 17.5L13.3333 13.3333M10 3.75C5.83333 3.75 2.27417 6.34167 0.833336 10C1.66667 11.6667 2.91667 13.0833 4.41667 14.1667M15.5833 5.83333C17.0833 6.91667 18.3333 8.33333 19.1667 10C17.7258 13.6583 14.1667 16.25 10 16.25C8.75 16.25 7.58333 16 6.5 15.5833" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.3"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 3.75C5.83333 3.75 2.27417 6.34167 0.833336 10C2.27417 13.6583 5.83333 16.25 10 16.25C14.1667 16.25 17.7258 13.6583 19.1667 10C17.7258 6.34167 14.1667 3.75 10 3.75ZM10 14.1667C7.69917 14.1667 5.83333 12.3008 5.83333 10C5.83333 7.69917 7.69917 5.83333 10 5.83333C12.3008 5.83333 14.1667 7.69917 14.1667 10C14.1667 12.3008 12.3008 14.1667 10 14.1667ZM10 7.5C8.61917 7.5 7.5 8.61917 7.5 10C7.5 11.3808 8.61917 12.5 10 12.5C11.3808 12.5 12.5 11.3808 12.5 10C12.5 8.61917 11.3808 7.5 10 7.5Z" fill="currentColor" fillOpacity="0.3"/>
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { AuthInput };
