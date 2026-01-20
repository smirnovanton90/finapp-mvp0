"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "./input";

interface AuthInputProps extends React.ComponentProps<"input"> {
  icon?: "user" | "lock";
  gradientDirection?: "left-to-right" | "right-to-left";
}

function AuthInput({ 
  className, 
  icon = "user",
  gradientDirection = "left-to-right",
  ...props 
}: AuthInputProps) {
  const [isFocused, setIsFocused] = React.useState(false);
  const [hasValue, setHasValue] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  
  const isPasswordField = props.type === "password";

  React.useEffect(() => {
    if (props.value !== undefined) {
      setHasValue(String(props.value).length > 0);
    }
  }, [props.value]);

  // Base gradient colors based on direction
  const baseGradientColors = gradientDirection === "left-to-right"
    ? { start: "#7C6CF1", middle: "#6C5DD7", end: "#5544D1" }
    : { start: "#5544D1", middle: "#6C5DD7", end: "#7C6CF1" };

  // Reverse gradient on hover
  const gradientColors = isHovered
    ? { start: baseGradientColors.end, middle: baseGradientColors.middle, end: baseGradientColors.start }
    : baseGradientColors;

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
      {/* Container with both stroke and fill layers */}
      <div className="relative rounded-lg">
        {/* Stroke layer - always visible (creates border effect) */}
        <div
          className="absolute inset-0 rounded-lg pointer-events-none z-0"
          style={{
            padding: "1px",
            background: `linear-gradient(to right, ${gradientColors.start}, ${gradientColors.middle}, ${gradientColors.end})`,
            WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            opacity: 1,
            transition: "background 1000ms ease",
          }}
        />
        
        {/* Fill layer - visible on focus with low opacity */}
        <div
          className="absolute inset-0 rounded-lg pointer-events-none transition-opacity duration-300 z-0"
          style={{
            background: `linear-gradient(to right, ${gradientColors.start}, ${gradientColors.middle}, ${gradientColors.end})`,
            opacity: isFocused ? 0.1 : 0,
          }}
        />
        
        {/* Inner container - transparent by default */}
        <div className="relative flex items-center rounded-lg bg-transparent px-4 h-12 z-10">
          {/* Input */}
          <input
            {...props}
            ref={inputRef}
            type={isPasswordField && showPassword ? "text" : props.type}
            className={cn(
              "flex-1 bg-transparent border-0 p-0 h-auto text-white text-base",
              "placeholder:text-[#8E81E6] placeholder:opacity-30",
              "focus-visible:ring-0 focus-visible:outline-none focus-visible:border-0",
              "transition-all duration-200",
              "selection:bg-primary selection:text-primary-foreground",
              isFocused && "placeholder:text-[#CFCFD6] placeholder:opacity-100",
              isPasswordField && "pr-8",
              className
            )}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
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
