import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowDownIcon, ArrowRightIcon } from "./icons";
import { Spinner } from "./Spinner";

type Variant = "primary" | "inverse" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";
type Arrow = "right" | "down" | false;

/*
 * Botón editorial: esquinas rectas, mayúsculas espaciadas y un relleno que se desliza al pasar el cursor.
 * La flecha vive en su propio segmento para que la acción se lea de un vistazo.
 */
const base =
  "group/button relative isolate inline-flex items-center justify-between gap-4 overflow-hidden font-semibold tracking-[0.16em] uppercase select-none " +
  "transition-[color,background-color,border-color,transform] duration-(--duration-base) ease-soft active:scale-[0.985] " +
  "before:absolute before:inset-0 before:-z-10 before:origin-left before:scale-x-0 before:transition-transform before:duration-500 before:ease-soft hover:before:scale-x-100 " +
  "disabled:pointer-events-none disabled:opacity-55 aria-busy:pointer-events-none aria-busy:opacity-100";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-bg before:bg-[#3a3129]",
  inverse: "bg-on-ink text-ink before:bg-sand",
  outline: "border border-fg text-fg before:bg-fg hover:text-bg",
  ghost: "text-fg before:bg-sand",
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
  const segment = size === "lg" ? `grid size-10 place-items-center ${variant === "primary" ? "bg-bg/10" : variant === "inverse" ? "bg-ink/8" : ""}` : "";
  return (
    <span aria-hidden="true" className={segment}>
      <Icon className={`size-4 transition-transform duration-(--duration-base) ease-soft ${motion}`} />
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
