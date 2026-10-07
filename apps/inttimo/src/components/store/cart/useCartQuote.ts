"use client";

import { useEffect, useState } from "react";
import type { CartQuoteResponse } from "@/lib/store/contract";
import { getStoreApi } from "@/lib/store/api";
import { useCart } from "./CartProvider";

/** Cotiza el carrito en el servidor cada vez que cambia (precios y totales nunca se calculan solo en el navegador). */
export function useCartQuote(couponCode?: string) {
  const { lines, ready } = useCart();
  const [quote, setQuote] = useState<CartQuoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(lines) + (couponCode ?? "");

  useEffect(() => {
    if (!ready) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- indica la cotización en curso
    setLoading(true);
    const timer = setTimeout(async () => {
      if (!lines.length) {
        if (active) {
          setQuote(null);
          setLoading(false);
        }
        return;
      }
      const result = await getStoreApi().quoteCart({ lines, couponCode: couponCode || undefined });
      if (!active) return;
      setQuote(result.ok ? result.data : null);
      setError(result.ok ? null : result.error.message);
      setLoading(false);
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clave serializada cubre líneas y cupón
  }, [key, ready]);

  return { quote, error, loading: loading || !ready };
}
