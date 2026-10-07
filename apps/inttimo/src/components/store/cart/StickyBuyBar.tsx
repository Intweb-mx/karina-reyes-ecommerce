"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BagIcon } from "@/components/ui/icons";
import { useCart } from "./CartProvider";

/**
 * Barra de compra fija en móvil: aparece cuando el botón principal sale de la pantalla,
 * para que agregar al carrito nunca quede lejos mientras se lee el detalle del producto.
 */
export function StickyBuyBar({ productId, productName, price, targetId }: { productId: string; productName: string; price: string; targetId: string }) {
  const { add } = useCart();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    // Visible solo cuando el bloque de compra ya quedó arriba de la pantalla (no antes de llegar a él).
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setVisible(target.getBoundingClientRect().bottom < 0));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [targetId]);

  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 px-4 py-3 shadow-[0_-12px_30px_-20px_rgb(34_28_23/0.5)] backdrop-blur-md transition-transform duration-300 ease-soft lg:hidden print:hidden ${visible ? "translate-y-0" : "translate-y-full"}`}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-4">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted">{productName}</p>
          <p className="font-serif text-2xl leading-none font-medium lining-nums">{price}</p>
        </div>
        <Button type="button" variant="bronze" size="md" icon={<BagIcon className="size-4" />} onClick={() => add(productId, 1)} className="flex-1 justify-center">
          Agregar al carrito
        </Button>
      </div>
    </div>
  );
}
