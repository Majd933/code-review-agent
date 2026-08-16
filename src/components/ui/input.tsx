import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full min-h-10 rounded-lg border border-[var(--border)] bg-white px-3.5 py-2 text-sm text-[var(--text)] shadow-[var(--shadow-sm)]",
        "placeholder:text-[var(--muted)]",
        "transition-[border-color,box-shadow]",
        "hover:border-[var(--border-strong)]",
        "focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]",
        className,
      )}
      {...props}
    />
  );
}
