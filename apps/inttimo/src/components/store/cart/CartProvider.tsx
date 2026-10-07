"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CartLine } from "@/lib/store/contract";

/**
 * Carrito persistente de invitado. Solo guarda { productId, quantity } en el navegador:
 * precios y totales siempre los calcula el servidor (StoreApi.quoteCart). CLAUDE.md §13.
 */
type CartContextValue = {
  lines: CartLine[];
  count: number;
  ready: boolean;
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  /** Último producto agregado, para mostrar la confirmación. */
  lastAdded: { productId: string; at: number } | null;
  /** Carrito lateral: se abre al agregar y desde el ícono del header. */
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const KEY = "inttimo:cart:v1";
const CartContext = createContext<CartContextValue | null>(null);

function read(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line): line is CartLine => typeof line?.productId === "string" && Number.isInteger(line?.quantity) && line.quantity > 0).slice(0, 50);
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [lastAdded, setLastAdded] = useState<CartContextValue["lastAdded"]>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    // Se lee al montar (el servidor no conoce el carrito) y se sincroniza entre pestañas.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura única de almacenamiento del navegador
    setLines(read());
    setReady(true);
    const onStorage = (event: StorageEvent) => event.key === KEY && setLines(read());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: CartLine[]) => {
    setLines(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Almacenamiento bloqueado (modo privado): el carrito funciona en memoria durante la visita.
    }
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      ready,
      lastAdded,
      drawerOpen,
      openDrawer,
      closeDrawer,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      add(productId, quantity = 1) {
        const existing = lines.find((line) => line.productId === productId);
        persist(existing ? lines.map((line) => (line.productId === productId ? { ...line, quantity: line.quantity + quantity } : line)) : [...lines, { productId, quantity }]);
        setLastAdded({ productId, at: Date.now() });
        setDrawerOpen(true);
      },
      setQuantity(productId, quantity) {
        persist(quantity <= 0 ? lines.filter((line) => line.productId !== productId) : lines.map((line) => (line.productId === productId ? { ...line, quantity } : line)));
      },
      remove(productId) {
        persist(lines.filter((line) => line.productId !== productId));
      },
      clear() {
        persist([]);
      },
    }),
    [lines, ready, lastAdded, drawerOpen, openDrawer, closeDrawer, persist],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart requiere CartProvider");
  return context;
}
