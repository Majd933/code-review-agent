import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--on-accent)] shadow-[var(--shadow-sm)] hover:bg-[var(--accent-hover)] active:translate-y-px disabled:opacity-50 disabled:hover:bg-[var(--accent)] disabled:active:translate-y-0",
  secondary:
    "bg-white text-[var(--text)] border border-[var(--border)] shadow-[var(--shadow-sm)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-soft)] disabled:opacity-50",
  ghost:
    "bg-transparent text-[var(--muted)] hover:text-[var(--text)] hover:bg-black/[0.04] disabled:opacity-50",
  danger:
    "bg-[var(--danger-soft)] text-[var(--danger)] border border-rose-200 hover:bg-rose-100",
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
        "inline-flex h-8 min-h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium tracking-tight transition",
        "disabled:cursor-not-allowed",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
