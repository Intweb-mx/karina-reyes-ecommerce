"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";

/** Copia un valor al portapapeles con confirmación visible y anunciada. */
export function CopyButton({ value, label, appearance = "chip" }: { value: string; label: string; appearance?: "chip" | "button" }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el folio sigue visible para copiarlo a mano.
    }
  }

  const icon = copied ? <CheckIcon className="animate-pop size-4 text-success" /> : <CopyIcon className="size-4" />;
  const text = <span aria-live="polite">{copied ? "Copiado" : label}</span>;

  if (appearance === "button") {
    return (
      <Button type="button" variant="outline" size="md" icon={icon} onClick={copy}>
        {text}
      </Button>
    );
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-8 items-center gap-1.5 border border-border px-2.5 text-xs text-muted transition-colors hover:border-fg/40 hover:bg-bg hover:text-fg print:hidden"
    >
      {copied ? <CheckIcon className="animate-pop size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
      {text}
    </button>
  );
}
