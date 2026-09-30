import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowDownIcon, ArrowRightIcon } from "./icons";
import { Spinner } from "./Spinner";

type Variant = "primary" | "inverse" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";
type Arrow = "right" | "down" | false;

/*
 * Botón editorial de inttimo.
 * - Relleno que se desliza de izquierda a derecha al pasar el cursor (before:).
 * - Brillo diagonal que cruza el botón una vez (after:), solo en principal e invertido.
 * - La flecha vive en su propio segmento para que la acción se lea de un vistazo.
 * - Se hunde al presionar; anillo de foco separado del borde para teclado.
 */
const base =
  "group/button relative isolate inline-flex items-center justify-between gap-4 overflow-hidden font-semibold tracking-[0.16em] uppercase select-none " +
  "transition-[color,background-color,border-color,box-shadow,transform] duration-(--duration-base) ease-soft active:translate-y-px active:scale-[0.99] " +
  "focus-visible:outline-2 focus-visible:outline-offset-4 " +
  "before:absolute before:inset-0 before:-z-10 before:origin-left before:scale-x-0 before:transition-transform before:duration-500 before:ease-soft hover:before:scale-x-100 " +
  "disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none aria-busy:opacity-100";

const sheen =
  "after:pointer-events-none after:absolute after:inset-y-0 after:left-0 after:w-1/4 after:-translate-x-[150%] after:skew-x-[-20deg] after:bg-gradient-to-r after:from-transparent after:via-white/25 after:to-transparent " +
  "after:transition-transform after:duration-[900ms] after:ease-soft hover:after:translate-x-[520%]";

const variants: Record<Variant, string> = {
  primary: `bg-accent text-bg shadow-[0_1px_0_rgb(255_255_255/0.08)_inset,0_10px_24px_-14px_rgb(34_28_23/0.7)] hover:shadow-[0_1px_0_rgb(255_255_255/0.08)_inset,0_16px_32px_-16px_rgb(34_28_23/0.8)] before:bg-[#3a3129] ${sheen}`,
  inverse: `bg-on-ink text-ink before:bg-sand ${sheen}`,
  outline: "border border-fg/80 bg-transparent text-fg before:bg-fg hover:border-fg hover:text-bg",
  ghost: "text-fg before:bg-sand/80",
};

const sizes: Record<Size, string> = {
  sm: "min-h-10 px-4 text-[0.6875rem]",
  md: "min-h-12 px-5 text-xs",
  lg: "min-h-14 pl-6 pr-2 text-[0.8125rem]",
};

export function buttonClass({ variant = "primary", size = "lg", block = false }: { variant?: Variant; size?: Size; block?: boolean } = {}) {
  return `${base} ${variants[variant]} ${sizes[size]} ${block ? "w-full" : ""}`;
}

function ArrowSegment({ arrow, variant, size }: { arrow: Arrow; variant: Variant; size: Size }) {
  if (!arrow) return null;
  const Icon = arrow === "down" ? ArrowDownIcon : ArrowRightIcon;
  const motion = arrow === "down" ? "group-hover/button:translate-y-0.5" : "group-hover/button:translate-x-1";
  const tint = variant === "primary" ? "bg-bg/10 group-hover/button:bg-bg/15" : variant === "inverse" ? "bg-ink/[0.07] group-hover/button:bg-ink/10" : "";
  const segment = size === "lg" ? `grid size-10 place-items-center transition-colors duration-(--duration-base) ${tint}` : "";
  return (
    <span aria-hidden="true" className={segment}>
      <Icon className={`size-4 transition-transform duration-(--duration-base) ease-soft ${motion}`} />
    </span>
  );
}

/** Barra de progreso indeterminada al pie del botón mientras se procesa. */
function LoadingBar() {
  return (
    <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-current/15">
      <span className="animate-indeterminate block h-full w-1/3 bg-current/70" />
    </span>
  );
}

type Shared = { variant?: Variant; size?: Size; block?: boolean; arrow?: Arrow; icon?: ReactNode; children: ReactNode };

export function Button({
  variant = "primary",
  size = "lg",
  block,
  arrow = false,
  icon,
  loading,
  children,
  className = "",
  ...props
}: Shared & { loading?: boolean } & ComponentProps<"button">) {
  return (
    <button {...props} aria-busy={loading || undefined} className={`${buttonClass({ variant, size, block })} ${!arrow || size !== "lg" ? "pr-5" : ""} ${className}`}>
      <span className="flex items-center gap-3">
        {loading ? <Spinner className="size-4" /> : icon}
        {children}
      </span>
      {!loading && <ArrowSegment arrow={arrow} variant={variant} size={size} />}
      {loading && <LoadingBar />}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "lg", block, arrow = "right", icon, children, className = "", ...props }: Shared & ComponentProps<typeof Link>) {
  return (
    <Link {...props} className={`${buttonClass({ variant, size, block })} ${!arrow || size !== "lg" ? "pr-5" : ""} ${className}`}>
      <span className="flex items-center gap-3">
        {icon}
        {children}
      </span>
      <ArrowSegment arrow={arrow} variant={variant} size={size} />
    </Link>
  );
}

/** Enlace dentro de la misma página (#ancla) con apariencia de botón. */
export function AnchorButton({ variant = "primary", size = "lg", block, arrow = "down", icon, children, className = "", ...props }: Shared & ComponentProps<"a">) {
  return (
    <a {...props} className={`${buttonClass({ variant, size, block })} ${!arrow || size !== "lg" ? "pr-5" : ""} ${className}`}>
      <span className="flex items-center gap-3">
        {icon}
        {children}
      </span>
      <ArrowSegment arrow={arrow} variant={variant} size={size} />
    </a>
  );
}
