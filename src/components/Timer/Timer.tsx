import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { formatTime } from './formatTime.ts'
import { PauseIcon, PlayIcon, ResetIcon } from './icons.tsx'
import { useTimer } from './useTimer.ts'
import type { TimerPhase } from './useTimer.ts'
import './Timer.css'

const STATUS_TEXT: Record<TimerPhase, string> = {
  idle: 'Idle',
  running: 'Running',
  paused: 'Paused',
  limit: 'Limit reached',
}

/** How long a disappearing button stays in the DOM. Covers both button animations in Timer.css. */
const BUTTON_MOTION_MS = 200

/** `main` is the Start ↔ Pause slot: one and the same <button>, never re-mounted between the two. */
type ButtonId = 'main' | 'reset'

interface ButtonView {
  label: string
  icon: ReactNode
  /** Orange: the main action of the phase. */
  primary: boolean
  /** `first` / `second`: one of the two equal columns. `single`: the only button, centered. */
  place: 'first' | 'second' | 'single'
}

/**
 * Only the actions that are possible in the phase are shown:
 * idle — Start●; running — Pause● · Reset; paused — Start● · Reset; limit — Reset●.
 */
function getButtonView(id: ButtonId, phase: TimerPhase): ButtonView | null {
  if (id === 'main') {
    if (phase === 'limit') return null
    const running = phase === 'running'
    return {
      label: running ? 'Pause' : 'Start',
      icon: running ? <PauseIcon /> : <PlayIcon />,
      primary: true,
      place: phase === 'idle' ? 'single' : 'first',
    }
  }

  if (phase === 'idle') return null
  const alone = phase === 'limit'
  return { label: 'Reset', icon: <ResetIcon />, primary: alone, place: alone ? 'single' : 'second' }
}

interface Transition {
  from: TimerPhase
  to: TimerPhase
}

// Holding Enter repeats keydown, and every repeat would press the button again. (Space presses
// on keyup, so holding it presses only once anyway.)
function ignoreEnterRepeat(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.repeat && event.key === 'Enter') event.preventDefault()
}

export function Timer() {
  const timer = useTimer()
  const { phase } = timer
  const mainRef = useRef<HTMLButtonElement>(null)
  const resetRef = useRef<HTMLButtonElement>(null)

  // The last phase change, kept for BUTTON_MOTION_MS: a button that appears fades in, and a button
  // that disappears stays rendered as it was (inert) while it fades out.
  const [shownPhase, setShownPhase] = useState(phase)
  const [transition, setTransition] = useState<Transition | null>(null)
  if (shownPhase !== phase) {
    setShownPhase(phase)
    setTransition({ from: shownPhase, to: phase })
  }

  useEffect(() => {
    if (transition === null) return
    const timeoutId = window.setTimeout(() => setTransition(null), BUTTON_MOTION_MS)
    return () => window.clearTimeout(timeoutId)
  }, [transition])

  // Focus never falls to <body>: if the focused button disappears, focus moves to the button that
  // stays (Reset → idle: to Start; auto-stop at the limit: to Reset). Focus anywhere else is left
  // alone. The disappearing button only turned inert, and an inert element keeps focus until the
  // next rendering update (HTML focus fixup), so document.activeElement is still accurate here.
  useLayoutEffect(() => {
    if (transition === null) return
    const hasFocus = (button: HTMLButtonElement | null) =>
      button !== null && button === document.activeElement

    if (transition.to === 'idle' && hasFocus(resetRef.current)) mainRef.current?.focus()
    if (transition.to === 'limit' && hasFocus(mainRef.current)) resetRef.current?.focus()
  }, [transition])

  const renderButton = (id: ButtonId) => {
    const view = getButtonView(id, phase)
    const leavingView =
      view === null && transition !== null ? getButtonView(id, transition.from) : null
    const shown = view ?? leavingView
    if (shown === null) return null

    const leaving = leavingView !== null
    const entering =
      view !== null && transition !== null && getButtonView(id, transition.from) === null
    const onClick = id === 'reset' ? timer.reset : phase === 'running' ? timer.pause : timer.start

    return (
      <button
        key={id}
        ref={id === 'main' ? mainRef : resetRef}
        type="button"
        className={shown.primary ? 'timer__button timer__button--primary' : 'timer__button'}
        data-place={shown.place}
        data-motion={leaving ? 'exit' : entering ? 'enter' : undefined}
        inert={leaving}
        onClick={onClick}
        onKeyDown={ignoreEnterRepeat}
      >
        {shown.icon}
        {shown.label}
      </button>
    )
  }

  return (
    <section className="timer">
      <h1 className="timer__title">Timer</h1>

      <p className="timer__display">{formatTime(timer.elapsedMs)}</p>

      <p className="timer__status" data-phase={phase}>
        {STATUS_TEXT[phase]}
      </p>

      <div className="timer__controls">
        {renderButton('main')}
        {renderButton('reset')}
      </div>

      {/* Announces transitions only; the display and the status line are not live regions. */}
      <p className="visually-hidden" role="status">
        {timer.announcement}
      </p>
    </section>
  )
}
