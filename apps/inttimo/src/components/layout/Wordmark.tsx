/**
 * Logotipo tipográfico provisional de inttimo (minúsculas, doble t) hasta recibir el archivo final de marca.
 * El lema proviene del brief maestro.
 */
export function Wordmark({ tagline = true }: { tagline?: boolean }) {
  return (
    <span className="inline-flex flex-col leading-none">
      <span className="font-serif text-[1.5rem] font-medium tracking-[-0.01em] sm:text-3xl">inttimo</span>
      {tagline && <span className="mt-0.5 text-[0.5rem] font-semibold tracking-[0.26em] text-muted uppercase sm:mt-1 sm:text-[0.5625rem] sm:tracking-[0.28em]">El matrimonio se cultiva</span>}
    </span>
  );
}
