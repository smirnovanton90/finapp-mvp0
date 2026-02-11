 "use client";

 import Image from "next/image";

 import { ACTIVE_TEXT_DARK } from "@/lib/colors";
 import { cn } from "@/lib/utils";

 // Иллюстрация пустого состояния:
 // положите файл в public/illustrations/ с именем empty-state.png
 // Путь для Next/Image: "/illustrations/empty-state.png"
 const EMPTY_STATE_IMAGE = "/illustrations/empty-state.png";

type EmptyStateProps = {
  message?: string;
  className?: string;
};

export function EmptyState({ message = "Здесь ничего нет...", className }: EmptyStateProps) {
   return (
     <div
       className={cn(
         "flex flex-col items-center justify-center text-center gap-4 py-12",
         className
       )}
     >
      <div className="relative w-[400px] h-[280px] sm:w-[500px] sm:h-[340px]">
         <Image
           src={EMPTY_STATE_IMAGE}
           alt=""
          fill
          className="object-contain"
          sizes="(max-width: 640px) 400px, 500px"
          unoptimized
         />
       </div>
       <p
         style={{
           fontSize: 18,
           fontWeight: 400,
           color: ACTIVE_TEXT_DARK,
         }}
       >
         {message}
       </p>
     </div>
   );
 }

