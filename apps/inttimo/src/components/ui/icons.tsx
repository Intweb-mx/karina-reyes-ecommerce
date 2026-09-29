import type { SVGProps } from "react";

/* Iconos de trazo fino, decorativos por defecto (aria-hidden). */
type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  );
}

export const LockIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="1.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </Base>
);

export const ArrowRightIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </Base>
);

export const ArrowDownIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 4v16M6 14l6 6 6-6" />
  </Base>
);

export const CheckIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Base>
);

export const ClockIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Base>
);

export const CloseIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
);

export const AlertIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </Base>
);

export const MailIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
    <path d="M4 7l8 6 8-6" />
  </Base>
);

export const PenIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16v4z" />
  </Base>
);

export const RefundIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 9h11a5 5 0 0 1 0 10H9" />
    <path d="M8 5L4 9l4 4" />
  </Base>
);
