import Image from "next/image";
import type { ReactNode } from "react";
import type { ProductImage } from "@/lib/store/contract";
import { PlaceholderTag } from "@/components/presale/sections/PresaleHero";

/**
 * Encabezado editorial de página (mockups 01–13): foto a sangre con degradado hacia el texto.
 * `tone="dark"` = texto claro sobre foto oscura; `tone="light"` = foto a la derecha que se funde con el crema.
 */
export function PageHero({
  eyebrow,
  title,
  body,
  image,
  actions,
  tone = "light",
  size = "md",
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  image?: ProductImage;
  actions?: ReactNode;
  tone?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  children?: ReactNode;
}) {
  const dark = tone === "dark";
  const height = size === "lg" ? "min-h-[min(40rem,calc(100dvh-var(--header-height)))]" : size === "md" ? "min-h-[26rem]" : "min-h-[18rem]";
  return (
    <section className={`relative isolate overflow-hidden ${dark ? "surface-ink bg-ink text-on-ink" : ""}`}>
      {image && (
        <div aria-hidden="true" className={`absolute inset-0 -z-10 ${dark ? "" : "left-auto hidden w-[55%] md:block"}`}>
          <Image src={image.src} alt="" fill priority sizes={dark ? "100vw" : "55vw"} className="animate-hero-settle object-cover" />
          <div className={`absolute inset-0 ${dark ? "bg-gradient-to-r from-ink via-ink/75 to-ink/20" : "bg-gradient-to-r from-bg via-bg/60 to-transparent"}`} />
          {image.placeholder && <PlaceholderTag className="top-4 right-4" />}
        </div>
      )}
      <div className={`container-page flex flex-col justify-center py-14 sm:py-20 ${height}`}>
        <div className="animate-rise max-w-xl">
          <p className={`eyebrow ${dark ? "text-on-ink-muted" : "text-muted"}`}>{eyebrow}</p>
          <h1 className="mt-4 font-serif text-[clamp(2.75rem,6.5vw,5rem)] leading-[0.98] font-medium tracking-[-0.015em] text-balance">{title}</h1>
          {body && <div className={`mt-5 max-w-lg text-lg leading-relaxed ${dark ? "text-on-ink/85" : "text-muted"}`}>{body}</div>}
          {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
          {children}
        </div>
      </div>
    </section>
  );
}

/** Encabezado de sección centrado con línea bronce. */
export function SectionHeading({ eyebrow, title, body, align = "center" }: { eyebrow?: string; title: ReactNode; body?: ReactNode; align?: "center" | "left" }) {
  const center = align === "center";
  return (
    <div className={`${center ? "mx-auto text-center" : ""} max-w-2xl`}>
      {eyebrow && <p className="eyebrow text-muted">{eyebrow}</p>}
      <h2 className="mt-3 font-serif text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.04] font-medium text-balance">{title}</h2>
      <span aria-hidden="true" className={`mt-5 block h-px w-14 bg-bronze/60 ${center ? "mx-auto" : ""}`} />
      {body && <p className="mt-5 leading-relaxed text-muted">{body}</p>}
    </div>
  );
}
