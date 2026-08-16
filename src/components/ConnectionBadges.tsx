import type { ConnectionStatus } from "../../electron/main/types";
import { Button } from "@/components/ui/button";
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
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "checking"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-rose-200 bg-rose-50 text-rose-800";
  const dot =
    status === "connected"
      ? "bg-[var(--success)]"
      : status === "checking"
        ? "bg-[var(--warn)]"
        : "bg-[var(--danger)]";
  const text =
    status === "connected" ? "Connected" : status === "checking" ? "Checking..." : "Disconnected";
  const description = message || `${label} ${text}`;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5",
        tone,
      )}
      title={description}
      aria-label={description}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden="true" />
      <span className="text-xs opacity-80">{label}</span>
      <span className="text-xs font-semibold">{text}</span>
    </div>
  );
}

export function ConnectionBadges({
  bitbucket,
  copilot,
  bitbucketMessage,
  copilotMessage,
  onCheck,
  checking,
}: {
  bitbucket: ConnectionStatus;
  copilot: ConnectionStatus;
  bitbucketMessage?: string;
  copilotMessage?: string;
  onCheck: () => void;
  checking: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Badge label="Bitbucket" status={bitbucket} message={bitbucketMessage} />
      <Badge label="Copilot" status={copilot} message={copilotMessage} />
      <Button
        variant="ghost"
        onClick={onCheck}
        disabled={checking}
        className="h-8 px-3 text-xs"
        aria-label="Recheck Bitbucket and Copilot connections"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} aria-hidden="true" />
        Recheck
      </Button>
    </div>
  );
}
