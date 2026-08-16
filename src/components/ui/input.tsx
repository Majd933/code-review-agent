import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full min-h-10 rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-sm text-[var(--text)] shadow-sm",
        "placeholder:text-[var(--muted)]",
        "focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]",
        className,
      )}
      {...props}
    />
  );
}
