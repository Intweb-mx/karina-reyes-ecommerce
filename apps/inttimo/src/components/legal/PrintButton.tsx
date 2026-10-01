"use client";

import type { ReactNode } from "react";

export function PrintButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center gap-2 border border-border px-3.5 text-sm text-muted transition-colors hover:border-fg/40 hover:text-fg"
    >
      {children}
    </button>
  );
}
