/**
 * Logotipo tipográfico provisional de inttimo (minúsculas, doble t) hasta recibir el archivo final de marca.
 * El lema proviene del brief maestro.
 */
export function Wordmark({ tagline = true }: { tagline?: boolean }) {
  return (
    <span className="inline-flex flex-col leading-none">
      <span className="font-serif text-[1.75rem] font-medium tracking-[-0.01em] sm:text-3xl">inttimo</span>
      {tagline && <span className="mt-1 text-[0.5625rem] font-semibold tracking-[0.28em] text-muted uppercase">El matrimonio se cultiva</span>}
    </span>
  );
}
