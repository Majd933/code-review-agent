import type { ConnectionStatus } from "../../electron/main/types";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

function Badge({
  label,
  status,
  message,
}: {
  label: string;
  status: ConnectionStatus;
  message?: string;
}) {
  const tone =
    status === "connected"
      ? "border-emerald-200/80 bg-[var(--success-soft)] text-emerald-800"
      : status === "checking"
        ? "border-amber-200/80 bg-[var(--warn-soft)] text-amber-800"
        : "border-rose-200/80 bg-[var(--danger-soft)] text-rose-800";
  const dot =
    status === "connected" ? "online" : status === "checking" ? "checking" : "offline";
  const text =
    status === "connected" ? "Connected" : status === "checking" ? "Checking..." : "Disconnected";
  const description = message || `${label} ${text}`;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-[var(--shadow-sm)] transition",
        tone,
      )}
      title={description}
      aria-label={description}
    >
      <span className={cn("status-dot", dot)} aria-hidden="true" />
      <span className="text-xs font-medium opacity-80">{label}</span>
      <span className="text-xs font-semibold tracking-tight">{text}</span>
    </div>
  );
}

function ActivityChip({
  label,
  tone,
}: {
  label: string;
  tone: "connecting" | "reviewing";
}) {
  const styles =
    tone === "reviewing"
      ? "border-blue-200/80 bg-blue-50 text-blue-800"
      : "border-amber-200/80 bg-[var(--warn-soft)] text-amber-800";

  return (
    <div
      className={cn(
        "flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold tracking-tight shadow-[var(--shadow-sm)]",
        styles,
      )}
      aria-live="polite"
      aria-label={label}
    >
      <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ConnectionBadges({
  bitbucket,
  copilot,
  bitbucketMessage,
  copilotMessage,
  connecting,
  reviewing,
}: {
  bitbucket: ConnectionStatus;
  copilot: ConnectionStatus;
  bitbucketMessage?: string;
  copilotMessage?: string;
  connecting: boolean;
  reviewing: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {connecting ? (
        <ActivityChip label="Connecting..." tone="connecting" />
      ) : reviewing ? (
        <ActivityChip label="Reviewing..." tone="reviewing" />
      ) : null}
      <Badge label="Bitbucket" status={bitbucket} message={bitbucketMessage} />
      <Badge label="Copilot" status={copilot} message={copilotMessage} />
    </div>
  );
}
