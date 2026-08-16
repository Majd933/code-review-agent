import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--on-accent)] shadow-sm hover:brightness-95 disabled:opacity-50 disabled:hover:brightness-100 disabled:shadow-none",
  secondary:
    "bg-white text-[var(--text)] border border-[var(--border)] shadow-sm hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50",
  ghost:
    "bg-transparent text-[var(--muted)] hover:text-[var(--text)] hover:bg-black/5 disabled:opacity-50",
  danger:
    "bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/20 hover:bg-[var(--danger)]/16",
};

export function Button({
  className,
  variant = "secondary",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
        "disabled:cursor-not-allowed",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
