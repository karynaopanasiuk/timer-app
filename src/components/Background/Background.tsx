import './Background.css'

/** Decorative page background: a near-black vignette with faint glows that slowly drift. */
export function Background() {
  return (
    <div className="background" aria-hidden="true">
      <div className="background__glow background__glow--haze" />
      <div className="background__glow background__glow--orange" />
      <div className="background__glow background__glow--mist" />
    </div>
  )
}
