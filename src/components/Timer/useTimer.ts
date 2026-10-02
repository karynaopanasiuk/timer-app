import { useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import { formatTime } from './formatTime.ts'

/** The timer stops at 59:59. `60:00` is never shown. */
export const LIMIT_MS = 3_599_000

/**
 * After every transition (a button press or the auto-stop at the limit) actions are ignored for
 * this long. After a transition another button can end up under the pointer, so the second click
 * of a double click must not press it (e.g. Start, then Pause at 00:00).
 */
export const ACTION_LOCK_MS = 400

/** How often the display is recalculated while running. The value itself always comes from Date.now(). */
const TICK_MS = 250

export type TimerStatus = 'idle' | 'running' | 'paused'

/** What the UI shows: `limit` is `paused` at LIMIT_MS. */
export type TimerPhase = TimerStatus | 'limit'

export interface TimerState {
  status: TimerStatus
  /** Time from previous runs, ms. */
  accumulatedMs: number
  /** Date.now() at the last Start; null unless running. */
  startedAt: number | null
  /** Date.now() at the last action or tick. */
  now: number
  /** Text for the visually hidden live region. Changes only on transitions. */
  announcement: string
}

export type TimerAction =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'reset' }

export const initialTimerState: TimerState = {
  status: 'idle',
  accumulatedMs: 0,
  startedAt: null,
  now: 0,
  announcement: '',
}

/** Elapsed time at `now`: never below 0 (e.g. the clock was set back), never above LIMIT_MS. */
export function getElapsedMs(state: TimerState, now: number = state.now): number {
  const runMs = state.startedAt === null ? 0 : Math.max(now - state.startedAt, 0)
  return Math.min(state.accumulatedMs + runMs, LIMIT_MS)
}

export function getPhase(state: TimerState): TimerPhase {
  return state.status === 'paused' && state.accumulatedMs >= LIMIT_MS ? 'limit' : state.status
}

/** running → paused. Keeps the value to the millisecond; at the limit it becomes "paused at the limit". */
function pauseAt(state: TimerState, now: number): TimerState {
  const elapsedMs = getElapsedMs(state, now)
  return {
    ...state,
    status: 'paused',
    accumulatedMs: elapsedMs,
    startedAt: null,
    now,
    announcement:
      elapsedMs >= LIMIT_MS
        ? `Maximum time reached. Timer paused at ${formatTime(LIMIT_MS)}`
        : `Timer paused at ${formatTime(elapsedMs)}`,
  }
}

/**
 * Pure transitions (state × action → state). An action that is not allowed in the current
 * state returns the same state object, so nothing changes and nothing is announced.
 */
export function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case 'start':
      // Guard against a double Start (double click, held Enter): while running, startedAt
      // is never overwritten. At the limit only Reset is allowed.
      if (state.status === 'running' || state.accumulatedMs >= LIMIT_MS) return state
      return {
        ...state,
        status: 'running',
        startedAt: action.now,
        now: action.now,
        announcement: 'Timer running',
      }

    case 'pause':
      return state.status === 'running' ? pauseAt(state, action.now) : state

    case 'tick':
      // A late tick after Pause or Reset is ignored and cannot bring back the old value.
      if (state.status !== 'running') return state
      return getElapsedMs(state, action.now) >= LIMIT_MS
        ? pauseAt(state, action.now)
        : { ...state, now: action.now }

    case 'reset':
      return state.status === 'idle' ? state : { ...initialTimerState, announcement: 'Timer reset' }
  }
}

export interface UseTimerResult {
  phase: TimerPhase
  elapsedMs: number
  announcement: string
  start: () => void
  pause: () => void
  reset: () => void
}

export function useTimer(): UseTimerResult {
  const [state, dispatch] = useReducer(timerReducer, initialTimerState)
  const isRunning = state.status === 'running'
  const phase = getPhase(state)

  // The only interval: it exists only while running and just triggers a recalculation.
  // Cleanup removes it on Pause / Reset / limit and on the StrictMode re-mount in dev.
  useEffect(() => {
    if (!isRunning) return

    const tick = () => dispatch({ type: 'tick', now: Date.now() })
    // Background tabs throttle timers: recalculate as soon as the tab is visible again.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick()
    }

    const intervalId = window.setInterval(tick, TICK_MS)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isRunning])

  // Every phase change opens the lock window, the auto-stop included. A layout effect runs right
  // after the commit, before the browser handles the next click or key press. performance.now()
  // is monotonic, so changing the system clock cannot stretch the window.
  const lockedUntilRef = useRef(0)
  const lockedPhaseRef = useRef(phase)
  useLayoutEffect(() => {
    if (lockedPhaseRef.current === phase) return
    lockedPhaseRef.current = phase
    lockedUntilRef.current = performance.now() + ACTION_LOCK_MS
  }, [phase])

  const dispatchUnlessLocked = (action: TimerAction) => {
    if (performance.now() >= lockedUntilRef.current) dispatch(action)
  }

  return {
    phase,
    elapsedMs: getElapsedMs(state),
    announcement: state.announcement,
    start: () => dispatchUnlessLocked({ type: 'start', now: Date.now() }),
    pause: () => dispatchUnlessLocked({ type: 'pause', now: Date.now() }),
    reset: () => dispatchUnlessLocked({ type: 'reset' }),
  }
}
