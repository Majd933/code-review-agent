import { SearchCheck } from "lucide-react";

export function AppMark() {
  return (
    <span className="app-mark" aria-hidden="true">
      <SearchCheck className="h-5 w-5" strokeWidth={2.25} />
    </span>
  );
}
