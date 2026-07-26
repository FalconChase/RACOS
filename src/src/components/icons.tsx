// Small hand-rolled icon set (Lucide-style stroke icons) so the UI doesn't
// depend on the lucide-react package — that package ships thousands of
// per-icon files and was unreliably slow to install in constrained
// environments. Same visual language, zero extra dependency.

interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HomeIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9.5v-6h5v6H17.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function CarIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M4 16.5V12l2-5.5a2 2 0 0 1 1.9-1.4h8.2A2 2 0 0 1 18 6.5L20 12v4.5" />
      <path d="M4 16.5h16" />
      <path d="M4 16.5V19a1 1 0 0 0 1 1h1.5a1 1 0 0 0 1-1v-1.5" />
      <path d="M16.5 17.5V19a1 1 0 0 0 1 1H19a1 1 0 0 0 1-1v-2.5" />
      <path d="M6.5 13h.01M17.5 13h.01" />
    </svg>
  );
}

export function CalendarRangeIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3.5M16 3v3.5" />
      <path d="M7.5 13.5h3M13.5 13.5h3M7.5 17h3" />
    </svg>
  );
}

export function UsersIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M16 8.5a2.7 2.7 0 1 1 0 5.4" />
      <path d="M15.5 14.3c2.6.3 4.6 2.4 5 5.2" />
    </svg>
  );
}

export function SettingsIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  );
}

export function RefreshIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M3.5 12a8.5 8.5 0 0 1 14.6-6" />
      <path d="M20.5 12a8.5 8.5 0 0 1-14.6 6" />
      <path d="M18.5 3v3.5H15M5.5 21v-3.5H9" />
    </svg>
  );
}

export function AlertTriangleIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M12 3.5 21.5 20h-19Z" />
      <path d="M12 9.5v4.5M12 17h.01" />
    </svg>
  );
}

export function ArrowUpRightIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

export function ArrowDownLeftIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M17 7 7 17M15 17H7V9" />
    </svg>
  );
}

export function KeyIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <circle cx="8" cy="15.5" r="4" />
      <path d="M11.3 12.5 20 3.8M16.5 8.3l2.7-2.7M19 4.5l1.5 1.5" />
    </svg>
  );
}

export function ReceiptIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3Z" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" />
    </svg>
  );
}

export function UserStarIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="m18 9 1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3Z" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}

export function CheckIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M5 12.5 9.5 17 19 6.5" />
    </svg>
  );
}

export function SearchIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </svg>
  );
}

export function CloudUpIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M7 18.5a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 17.3 8.5a4 4 0 0 1-.8 7.97" />
      <path d="M12 20v-6.5M9.3 15.8 12 13l2.7 2.8" />
    </svg>
  );
}

export function ToolIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M14.5 6.5a3.5 3.5 0 0 0-4.8 3.9L4 16.1V20h3.9l5.7-5.7a3.5 3.5 0 0 0 3.9-4.8l-2.6 2.6-2-2Z" />
    </svg>
  );
}

export function FileTextIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4" />
      <path d="M9 12.5h6M9 15.5h6M9 18h3.5" />
    </svg>
  );
}

export function PrinterIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M7 8.5V4h10v4.5" />
      <rect x="4" y="8.5" width="16" height="7" rx="1.5" />
      <path d="M7 15.5h10V20H7Z" />
    </svg>
  );
}

export function LockIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  );
}

export function PanelLeftIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M9.5 4.5v15" />
    </svg>
  );
}

export function MapPinIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M19.5 10.5c0 5.5-7.5 10-7.5 10s-7.5-4.5-7.5-10a7.5 7.5 0 0 1 15 0Z" />
      <circle cx="12" cy="10.5" r="2.7" />
    </svg>
  );
}

export function CameraIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18Z" />
      <circle cx="12" cy="13" r="3.3" />
    </svg>
  );
}
