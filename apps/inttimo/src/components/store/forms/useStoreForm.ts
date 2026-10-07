"use client";

import { useRef, useState } from "react";
import type { Result } from "@/lib/store/api";

type Status = "idle" | "sending" | "sent";

/**
 * Estado común de formularios de la tienda (contacto, cotización): validación local, envío,
 * errores del servidor por campo y foco en el primer error.
 */
export function useStoreForm<TData>(validate: (form: FormData) => Record<string, string[]>) {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<TData | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  function focusFirstError(keys: string[]) {
    requestAnimationFrame(() => {
      const field = keys.map((key) => ref.current?.querySelector<HTMLElement>(`[name="${key}"]`)).find(Boolean);
      field?.focus();
    });
  }

  async function submit(send: (form: FormData) => Promise<Result<TData>>) {
    const form = new FormData(ref.current!);
    const local = validate(form);
    setFormError(null);
    if (Object.keys(local).length) {
      setErrors(local);
      focusFirstError(Object.keys(local));
      return;
    }
    setErrors({});
    setStatus("sending");
    const response = await send(form);
    if (response.ok) {
      setResult(response.data);
      setStatus("sent");
      return;
    }
    setErrors(response.error.fieldErrors ?? {});
    setFormError(response.error.message);
    setStatus("idle");
    focusFirstError(Object.keys(response.error.fieldErrors ?? {}));
  }

  return { ref, status, errors, formError, result, submit, reset: () => setStatus("idle") };
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
