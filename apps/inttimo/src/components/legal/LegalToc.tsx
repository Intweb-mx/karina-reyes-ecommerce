"use client";

import { useEffect, useState } from "react";
import { ArrowUpIcon, ChevronDownIcon } from "@/components/ui/icons";

type Item = { id: string; title: string };

/** Marca la sección visible para resaltarla en el índice (scroll-spy). */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const first = ids.find((id) => visible.get(id));
        if (first) setActive(first);
      },
      { rootMargin: "-12% 0px -70% 0px" },
    );
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

/** Índice fijo en escritorio, con la sección actual resaltada. */
export function LegalTocDesktop({ items }: { items: Item[] }) {
  const active = useActiveSection(items.map((item) => item.id));
  return (
    <nav aria-label="Contenido del documento" className="sticky top-24 hidden max-h-[calc(100dvh-8rem)] overflow-y-auto pr-2 lg:block print:hidden">
      <p className="eyebrow text-muted">Contenido</p>
      <ol className="mt-4 space-y-0.5 border-l border-border text-sm">
        {items.map((item) => {
          const current = item.id === active;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={current ? "location" : undefined}
                className={`-ml-px block border-l-2 py-1.5 pl-4 leading-snug transition-colors ${current ? "border-bronze font-medium text-fg" : "border-transparent text-muted hover:border-fg/30 hover:text-fg"}`}
              >
                {item.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Índice plegable en móvil: no obliga a recorrer todas las secciones antes de leer. */
export function LegalTocMobile({ items }: { items: Item[] }) {
  return (
    <details className="group mt-8 border border-border bg-surface lg:hidden print:hidden">
      <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-semibold">Contenido</span>
          <span className="block text-xs text-muted lining-nums">{items.length} secciones · toca para ver</span>
        </span>
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full border border-border text-muted transition-transform group-open:rotate-180">
          <ChevronDownIcon className="size-4" />
        </span>
      </summary>
      <ol className="max-h-[55dvh] overflow-y-auto border-t border-border px-5 py-3 text-sm">
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className="block py-2 text-fg/80 underline-offset-4 hover:text-fg hover:underline">
              {item.title}
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Botón flotante para volver al inicio del documento; aparece al bajar. */
export function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 900);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <a
      href="#documento"
      aria-label="Volver al inicio del documento"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 grid size-12 place-items-center rounded-full border border-border bg-[#fffdf9]/95 text-fg shadow-[0_12px_28px_-14px_rgb(34_28_23/0.5)] backdrop-blur transition-[opacity,transform] duration-(--duration-base) hover:bg-sand sm:right-6 print:hidden ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <ArrowUpIcon className="size-5" />
    </a>
  );
}
