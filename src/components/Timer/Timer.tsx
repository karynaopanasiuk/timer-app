import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent, KeyboardEvent } from 'react'
import { formatTime } from './formatTime.ts'
import { Icon } from './icons.tsx'
import type { IconName } from './icons.tsx'
import { useTimer } from './useTimer.ts'
import type { TimerPhase } from './useTimer.ts'
import './Timer.css'

/**
 * How long the buttons morph after a phase change (`--morph-duration` in Timer.css, a frame or two
 * shorter: the morph ends on its soft tail, so it must not be cut off). A disappearing button stays
 * in the DOM (inert) this long. Shorter than ACTION_LOCK_MS, so the morph is over before the next
 * press can do anything.
 */
const BUTTON_MOTION_MS = 280

/** `main` is the Start ↔ Stop slot: one and the same <button>, never re-mounted between the two. */
type ButtonId = 'main' | 'reset'

/** `first` / `second`: one of the two equal columns. `single`: the only button, the full row. */
type Place = 'first' | 'second' | 'single'

/** Horizontal center of each place, in column steps (`--col-dx` in Timer.css) from the row's center. */
const PLACE_X: Record<Place, number> = { first: -1, single: 0, second: 1 }

interface ButtonView {
  label: string
  /** Shown after the label. */
  icon: IconName
  place: Place
}

/**
 * Only the actions that are possible in the phase are shown:
 * idle — Start; running — Stop · Reset; paused — Start · Reset; limit — Reset.
 */
function getButtonView(id: ButtonId, phase: TimerPhase): ButtonView | null {
  if (id === 'main') {
    if (phase === 'limit') return null
    const running = phase === 'running'
    return {
      label: running ? 'Stop' : 'Start',
      icon: running ? 'pause' : 'play',
      place: phase === 'idle' ? 'single' : 'first',
    }
  }

  if (phase === 'idle') return null
  return { label: 'Reset', icon: 'reset', place: phase === 'limit' ? 'single' : 'second' }
}

interface Transition {
  from: TimerPhase
  to: TimerPhase
}

interface Motion {
  kind: 'move' | 'enter' | 'exit'
  /** In column steps from the button's place: where its move starts. For an entrance or an exit
   *  only the direction counts (the side it drifts in from / out to, a few px). */
  shift: number
  /** A move between a column and the full row also changes the width: the button starts narrower
   *  (`grow`) or wider (`shrink`) than it ends. */
  resize?: 'grow' | 'shrink'
}

/**
 * How a button morphs in a transition (the glass splits and merges):
 * - move: it slides (and widens or narrows) from its old place to the new one;
 * - enter: it fades in at its place, drifting in a little from the other button's side;
 * - exit: it fades out where it is, drifting a little toward the other button's new place.
 * running ↔ paused keeps both places, so nothing moves.
 */
function getMotion(id: ButtonId, { from, to }: Transition): Motion | null {
  const other: ButtonId = id === 'main' ? 'reset' : 'main'
  const before = getButtonView(id, from)
  const after = getButtonView(id, to)

  if (before !== null && after !== null) {
    if (before.place === after.place) return null
    return {
      kind: 'move',
      shift: PLACE_X[before.place] - PLACE_X[after.place],
      resize: after.place === 'single' ? 'grow' : 'shrink',
    }
  }
  if (after !== null) {
    const otherBefore = getButtonView(other, from)
    const start = otherBefore === null ? after.place : otherBefore.place
    return { kind: 'enter', shift: PLACE_X[start] - PLACE_X[after.place] }
  }
  if (before !== null) {
    const otherAfter = getButtonView(other, to)
    const end = otherAfter === null ? before.place : otherAfter.place
    return { kind: 'exit', shift: PLACE_X[end] - PLACE_X[before.place] }
  }
  return null
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

  // The last phase change, kept for BUTTON_MOTION_MS while the buttons morph. A button that
  // disappears stays rendered as it was (inert) until the morph is over.
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

  // Which timer button has focus, recorded by the focus events themselves, i.e. before a phase
  // change is committed. Browsers blur a button that turns inert at different moments (some right
  // away, Chromium on the next frame); that blur is part of the transition, so it is not recorded
  // as focus leaving the buttons.
  const focusedRef = useRef<ButtonId | null>(null)
  const forgetFocus = (event: FocusEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.inert) focusedRef.current = null
  }

  // Focus never falls to <body>: if the focused button disappears, focus moves to the button that
  // stays (Reset → idle: to Start; auto-stop at the limit: to Reset). Focus anywhere else is left
  // alone. document.activeElement also counts: it keeps the button while the window itself is
  // blurred (e.g. the auto-stop happens in a background tab).
  useLayoutEffect(() => {
    if (transition === null) return
    const hadFocus = (id: ButtonId, button: HTMLButtonElement | null) =>
      focusedRef.current === id || (button !== null && button === document.activeElement)

    if (transition.to === 'idle' && hadFocus('reset', resetRef.current)) mainRef.current?.focus()
    if (transition.to === 'limit' && hadFocus('main', mainRef.current)) resetRef.current?.focus()
  }, [transition])

  const renderButton = (id: ButtonId) => {
    const view = getButtonView(id, phase)
    const leavingView =
      view === null && transition !== null ? getButtonView(id, transition.from) : null
    const shown = view ?? leavingView
    if (shown === null) return null

    const leaving = leavingView !== null
    const motion = transition === null ? null : getMotion(id, transition)
    const onClick = id === 'reset' ? timer.reset : phase === 'running' ? timer.pause : timer.start

    return (
      <button
        key={id}
        ref={id === 'main' ? mainRef : resetRef}
        type="button"
        className="timer__button"
        data-place={shown.place}
        data-motion={motion?.kind}
        data-resize={motion?.resize}
        style={motion === null ? undefined : ({ '--morph-shift': motion.shift } as CSSProperties)}
        inert={leaving}
        onClick={onClick}
        onKeyDown={ignoreEnterRepeat}
        onFocus={() => {
          focusedRef.current = id
        }}
        onBlur={forgetFocus}
      >
        {/* Label and icon form one group: centered, and scaled together by the morph. */}
        <span className="timer__content">
          <span className="timer__label">{shown.label}</span>
          <Icon name={shown.icon} />
        </span>
      </button>
    )
  }

  return (
    <section className="timer">
      {/* The page heading for screen readers only: the screen shows no visible title. */}
      <h1 className="visually-hidden">Timer</h1>

      {/* IBM Plex Sans has tabular figures, so the time never changes its width. */}
      <p className="timer__display">{formatTime(timer.elapsedMs)}</p>

      <div className="timer__controls">
        {renderButton('main')}
        {renderButton('reset')}
      </div>

      {/* Announces transitions only; the display is not a live region. */}
      <p className="visually-hidden" role="status">
        {timer.announcement}
      </p>
    </section>
  )
}
