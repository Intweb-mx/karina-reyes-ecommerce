"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Retraso en ms para escalonar elementos hermanos. */
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section";
};

/**
 * Aparición suave al entrar en pantalla (desvanecido + leve subida).
 * - Seguro sin JS: el HTML del servidor llega visible; solo se oculta, ya montado, lo que aún está debajo del pliegue.
 * - Respeta prefers-reduced-motion (no anima).
 * - Una sola vez por elemento.
 */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: Props) {
  const ref = useRef<HTMLDivElement & HTMLLIElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Lo que ya se ve al cargar no se oculta (evita parpadeos).
    if (element.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    setState("hidden");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setState("shown");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      style={state === "shown" && delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`${state === "idle" ? "" : "transition-[opacity,transform,filter] duration-[900ms] ease-soft"} ${
        state === "hidden" ? "translate-y-6 opacity-0 blur-[2px]" : "translate-y-0 opacity-100 blur-0"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}
