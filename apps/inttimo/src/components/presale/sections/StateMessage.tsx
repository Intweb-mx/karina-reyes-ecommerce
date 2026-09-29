import type { ReactNode } from "react";

/** Mensaje centrado para estados sin formulario (por abrir, cerrada, sin términos, 404, error). */
export function StateMessage({ id, eyebrow, title, body, children, as: Heading = "h2" }: { id?: string; eyebrow?: string; title: string; body: string; children?: ReactNode; as?: "h1" | "h2" }) {
  return (
    <div className="mx-auto max-w-xl py-8 text-center">
      {eyebrow && <p className="eyebrow mb-4 text-muted">{eyebrow}</p>}
      <Heading id={id} className="font-serif text-4xl leading-tight font-medium text-balance sm:text-5xl">
        {title}
      </Heading>
      <p className="mt-4 leading-relaxed text-muted">{body}</p>
      {children && <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}
