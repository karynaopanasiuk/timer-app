import type { SVGProps } from 'react'

// Inline icons on a 24×24 grid. They use currentColor, so they follow the button text color
// (including forced colors). They are decorative and hidden from assistive tech.

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5.5v13l10.5-6.5z" />
    </Icon>
  )
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </Icon>
  )
}

/** Rotate counter-clockwise (outline). */
export function ResetIcon(props: IconProps) {
  return (
    <Icon fill="none" strokeWidth={2.25} {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6l-2.5 2.5" />
      <path d="M3.5 4v4.5H8" />
    </Icon>
  )
}
