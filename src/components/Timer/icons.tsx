import type { ReactElement } from 'react'

/** Stop pauses the timer (it can be resumed), so, as in Figma, its picture is the pause bars. */
export type IconName = 'play' | 'pause' | 'reset'

// The Figma icons, every frame 32 × 40 px, drawn in `currentColor`. The frame is the viewBox; the
// size on the screen, the gap to the label and the opacity are set in Timer.css.
const VIEW_BOX = '0 0 32 40'

const SHAPES: Record<IconName, ReactElement> = {
  play: (
    <path
      d="M10.5098 9.14124C9.8432 8.74621 9 9.22667 9 10.0015V33.1582C9 33.933 9.8432 34.4135 10.5098 34.0185L30.0483 22.4402C30.7018 22.0529 30.7018 21.1069 30.0483 20.7195L10.5098 9.14124Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.7027"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  pause: (
    <g fill="currentColor" stroke="currentColor" strokeWidth="2.57031">
      <path d="M9 34.0143V12.9857C9 12.4413 9.26863 12 9.6 12H12.4C12.7314 12 13 12.4413 13 12.9857V34.0143C13 34.5587 12.7314 35 12.4 35H9.6C9.26863 35 9 34.5587 9 34.0143Z" />
      <path d="M21 34.0143V12.9857C21 12.4413 21.2686 12 21.6 12H24.4C24.7314 12 25 12.4413 25 12.9857V34.0143C25 34.5587 24.7314 35 24.4 35H21.6C21.2686 35 21 34.5587 21 34.0143Z" />
    </g>
  ),
  reset: (
    <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M29.4642 17.0499C27.6509 12.9001 23.5101 10 18.6918 10C12.5991 10 7.58952 14.6373 7 20.5749" />
      <path d="M24.5669 17.0502H29.7369C30.1262 17.0502 30.4418 16.7346 30.4418 16.3453V11.1753" />
      <path d="M7.97778 26.4503C9.79093 30.6001 13.9318 33.5002 18.75 33.5002C24.8427 33.5002 29.8524 28.8629 30.4419 22.9253" />
      <path d="M12.875 26.4502H7.70499C7.31564 26.4502 7 26.7658 7 27.1552V32.3251" />
    </g>
  ),
}

interface IconProps {
  name: IconName
}

/** Decorative: the button is named by its label alone, so assistive technology skips the icon. */
export function Icon({ name }: IconProps) {
  return (
    <svg
      className="timer__icon"
      data-icon={name}
      viewBox={VIEW_BOX}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[name]}
    </svg>
  )
}
