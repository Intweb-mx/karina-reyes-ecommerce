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

export const ReceiptIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8.5h6M9 12h6M9 15.5h3" />
  </Base>
);

export const CopyIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Base>
);

export const PrintIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M7 8.5V3.5h10v5" />
    <rect x="3.5" y="8.5" width="17" height="8" rx="1.5" />
    <path d="M7 14.5h10v6H7z" />
  </Base>
);

export const UserIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="8" r="3.75" />
    <path d="M4.5 20c.9-3.6 3.9-5.5 7.5-5.5s6.6 1.9 7.5 5.5" />
  </Base>
);

export const PhoneIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M5 4.5h3.2l1.6 4-2 1.3a10.5 10.5 0 0 0 6.4 6.4l1.3-2 4 1.6V19a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 3.5 6.1 1.5 1.5 0 0 1 5 4.5z" />
  </Base>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 9.5l6 6 6-6" />
  </Base>
);

export const MinusIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M5 12h14" />
  </Base>
);

export const PlusIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const HeartIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />
  </Base>
);

export const PeopleIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="9" cy="8.5" r="3" />
    <circle cx="16.5" cy="9.5" r="2.5" />
    <path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M14.5 14.6c.6-.2 1.3-.3 2-.3 2.2 0 3.9 1.5 4.4 4" />
  </Base>
);

export const LeafIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" />
    <path d="M5 19l8-8" />
  </Base>
);

export const GemIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M7 4.5h10l3.5 5-8.5 10-8.5-10z" />
    <path d="M3.5 9.5h17M9.5 4.5 12 19.5l2.5-15" />
  </Base>
);

export const CalendarIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="3.5" y="5.5" width="17" height="15" rx="1.5" />
    <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
  </Base>
);

export const BoxIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" />
    <path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
  </Base>
);

export const GiftIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="3.5" y="8.5" width="17" height="4" />
    <path d="M5 12.5v8h14v-8M12 8.5v12M12 8.5S10.5 4 8 4.5 7 8.5 12 8.5zM12 8.5S13.5 4 16 4.5s1 4-4 4z" />
  </Base>
);

export const StarIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </Base>
);

export const ChatIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4.5 19.5l1.2-3.6A7.5 7.5 0 1 1 8.4 18.6z" />
  </Base>
);

export const ArrowUpIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 20V4M6 10l6-6 6 6" />
  </Base>
);

export const TruckIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.5v2.5h-7z" />
    <circle cx="6.5" cy="17.5" r="1.75" />
    <circle cx="16.5" cy="17.5" r="1.75" />
  </Base>
);

export const MapPinIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" />
    <circle cx="12" cy="10" r="2.25" />
  </Base>
);

export const PlayIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M10 8.75v6.5L15.25 12z" />
  </Base>
);

export const FileIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M6.5 3.5h7l4 4v13h-11z" />
    <path d="M13.5 3.5v4h4M9 12.5h6M9 15.5h6" />
  </Base>
);

export const BagIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M5 8.5h14l-1 12H6z" />
    <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
  </Base>
);

export const MenuIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);

export const SearchIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Base>
);

export const TrashIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
  </Base>
);

export const ChurchIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 3v4M10 5h4M6 21V12l6-4 6 4v9" />
    <path d="M10 21v-4a2 2 0 0 1 4 0v4M3.5 21h17" />
  </Base>
);

export const SunIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Base>
);

export const BookIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M4 5.5A2 2 0 0 1 6 3.5h6v16H6a2 2 0 0 0-2 2zM20 5.5a2 2 0 0 0-2-2h-6v16h6a2 2 0 0 1 2 2z" />
  </Base>
);
