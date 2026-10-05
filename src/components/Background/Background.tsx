import { useEffect, useRef } from 'react'
import { createFlowShader } from './flowShader.ts'
import type { FlowShader } from './flowShader.ts'
import './Background.css'

/**
 * Decorative page background: plain black, and behind the pointer a wide cloud of muted blue,
 * violet and emerald smoke that spreads, softens and is gone in about 1.7 seconds. The smoke is
 * drawn by a WebGL shader (flowShader.ts), which keeps an animation loop only while there is
 * something to show: at rest the screen is black and nothing runs.
 *
 * Plain black, with no canvas at all, in the cases where the smoke cannot be shown:
 * - the user prefers reduced motion (the choice is followed live);
 * - the page is in forced colors (the layer is hidden then, see Background.css: no canvas, no WebGL
 *   context and no animation frames behind the hidden layer; also followed live);
 * - WebGL is not available, or its context is lost (the shader reports it, the canvas goes).
 */
export function Background() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (root === null) return

    // One query list for both "no smoke" cases (a comma means "or"): it changes when either does.
    const noSmoke = window.matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)')
    let canvas: HTMLCanvasElement | null = null
    let shader: FlowShader | null = null

    // The canvas and the shader go; what is left is the black layer.
    const stop = () => {
      shader?.destroy()
      shader = null
      canvas?.remove()
      canvas = null
    }

    const start = () => {
      // The canvas is made here, not in the JSX: a lost WebGL context can never be used again, and
      // React (StrictMode) runs this effect more than once for one element.
      const element = document.createElement('canvas')
      element.className = 'background__canvas'
      element.setAttribute('aria-hidden', 'true')
      root.append(element)

      const created = createFlowShader(element, stop)
      if (created === null) {
        element.remove()
        return
      }
      canvas = element
      shader = created
    }

    // Runs at the start and whenever the motion or the colors preference changes.
    const sync = () => {
      stop()
      if (!noSmoke.matches) start()
    }

    sync()
    noSmoke.addEventListener('change', sync)
    return () => {
      noSmoke.removeEventListener('change', sync)
      stop()
    }
  }, [])

  return <div className="background" aria-hidden="true" ref={rootRef} />
}
