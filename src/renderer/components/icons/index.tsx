/**
 * The icon set from the design. Every glyph is drawn on a 16×16 grid and
 * strokes with the colour it is given, so callers can tint them per status.
 */

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

function Svg({
  size = 14,
  color = "currentColor",
  strokeWidth = 1.5,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2 13.5 13.5" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.6} {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.6} {...props}>
      <path d="M8 3.5v9M3.5 8h9" />
    </Svg>
  );
}

/** Two arrows chasing each other: pulling in what the remotes have. */
export function RefreshIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.5} {...props}>
      <path d="M13.4 7.2A5.5 5.5 0 0 0 3.6 4.9M2.6 8.8a5.5 5.5 0 0 0 9.8 2.3" />
      <path d="M13.6 3.6v3.6H10M2.4 12.4V8.8H6" strokeLinejoin="round" />
    </Svg>
  );
}

/** Arrows pushing apart: the drawer taking the whole window. */
export function ExpandIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.5} {...props}>
      <path d="M6.5 8H2M4.2 5.8 2 8l2.2 2.2" strokeLinejoin="round" />
      <path d="M9.5 8H14M11.8 5.8 14 8l-2.2 2.2" strokeLinejoin="round" />
    </Svg>
  );
}

/** The same arrows drawn back in: the drawer returning to its width. */
export function CollapseIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.5} {...props}>
      <path d="M2 8h4.5M4.3 5.8 6.5 8l-2.2 2.2" strokeLinejoin="round" />
      <path d="M14 8H9.5M11.7 5.8 9.5 8l2.2 2.2" strokeLinejoin="round" />
    </Svg>
  );
}

export function ThemeIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.3} {...props}>
      <circle cx="8" cy="8" r="3.4" />
      <path d="M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
    </Svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.2 1.6h4.8A1.5 1.5 0 0 1 14 6.1v5.4A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
    </Svg>
  );
}

/** The caret on a control that has a menu behind it. */
export function ChevronIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.6} {...props}>
      <path d="M4.5 6.5 8 10l3.5-3.5" strokeLinejoin="round" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.8 4.2h10.4M6.4 4.2V2.9h3.2v1.3M4.3 4.2l.6 8.3a1 1 0 0 0 1 .9h4.2a1 1 0 0 0 1-.9l.6-8.3" />
    </Svg>
  );
}

/** The vertical ellipsis that opens a row's menu. Filled, not stroked. */
export function MoreIcon({ size = 13, color = "currentColor", className }: IconProps) {
  return (
    <BrandSvg size={size} color={color} className={className}>
      <circle cx="8" cy="3.4" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="8" cy="12.6" r="1.25" />
    </BrandSvg>
  );
}

export function BranchIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.4} {...props}>
      <circle cx="4.5" cy="3.6" r="1.9" />
      <circle cx="4.5" cy="12.4" r="1.9" />
      <circle cx="11.5" cy="6.2" r="1.9" />
      <path d="M4.5 5.5v5M6.6 6.2h2.9" />
    </Svg>
  );
}

export function PullRequestIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.4} {...props}>
      <circle cx="8" cy="8" r="6.2" />
      <circle cx="8" cy="8" r="2.1" />
    </Svg>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <Svg strokeWidth={1.4} {...props}>
      <path d="M2 4.5h12M2 8h12M2 11.5h12" />
      <circle cx="5.5" cy="4.5" r="1.5" fill="var(--panel)" />
      <circle cx="10.5" cy="8" r="1.5" fill="var(--panel)" />
      <circle cx="6.5" cy="11.5" r="1.5" fill="var(--panel)" />
    </Svg>
  );
}

/** Brand marks are filled rather than stroked, so they bypass `Svg`. */
function BrandSvg({
  size = 16,
  color = "currentColor",
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={color}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function GitHubIcon(props: IconProps) {
  return (
    <BrandSvg {...props}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </BrandSvg>
  );
}

export function GitLabIcon(props: IconProps) {
  return (
    <BrandSvg {...props}>
      <path d="M8 15.1 5.1 6.2h5.8z" />
      <path d="M8 15.1 1.2 6.2h3.9z" opacity="0.85" />
      <path d="M1.2 6.2 2.5 1.6c.07-.2.35-.2.42 0l1.28 4.6z" opacity="0.7" />
      <path d="M8 15.1 14.8 6.2h-3.9z" opacity="0.85" />
      <path d="M14.8 6.2 13.5 1.6c-.07-.2-.35-.2-.42 0l-1.28 4.6z" opacity="0.7" />
    </BrandSvg>
  );
}
