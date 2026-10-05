/**
 * The page background: a wide cloud of smoke that the pointer leaves behind it, drawn by one
 * full-screen fragment shader. Plain WebGL 1, no libraries.
 *
 * What it draws: pure black until a pointer moves (a mouse, a pen, a finger that drags). Then the
 * path of the pointer, a line through the last 40 samples of the (smoothed) pointer, is blurred into
 * smoke. A sample lives TRAIL_LIFE_MS (1.7 s) from the moment it was taken, and its age decides what
 * the shader does with it:
 * - width: the smoke spreads like ink in water, so the older it is, the wider and the softer. Its
 *   radius (half of the width at half of the brightness) is 11% of the shorter side of the screen at
 *   the pointer, ≈ 113 px on 1440 × 1024, and 2.3 times that when it is about to vanish. Across the
 *   line the brightness is a plain Gaussian: no flat top, no bright core, no edge. A faint, twice as
 *   wide haze (9% of the brightness) rides along with it, so that everything is a little blurred.
 * - brightness: at most 70% of the colour over black, at the pointer; it falls with the age along
 *   a smooth S (a smoothstep from the age of 0.12 to 1), so the trail keeps its body for most of
 *   its life and then dissolves, with no moment when it vanishes with a jump.
 * - colour: every sample gets a hue at the moment it is taken, and keeps it. The hue goes round a
 *   cycle of three colours, deep blue #2438C8, violet #6B35C8 and emerald #12936F, and from
 *   emerald back to blue, once in HUE_CYCLE_S (3.6 s, a little quicker and slower in turn). Each
 *   colour is held for a while and then gives way to the next, so the trail shows two neighbouring
 *   colours side by side. From violet to emerald the smoke passes through a clear azure #1F5899:
 *   the plain mix of the two is a dull steel blue. The older the smoke, the more it turns dark:
 *   blue and violet to slate blue #24476B (a violet zone only two thirds of the way), emerald to
 *   dark teal #17505A, and then all of them to navy #141B4D, while it turns transparent.
 * - billows: two slow noises bend the line, a fine one and a coarse one, and the older the smoke the
 *   more it follows the coarse one; a third noise thins the old smoke out into clouds.
 * The age and the hue are interpolated along every piece of the line, so a fast stroke leaves no
 * beads. A fine film grain lies on top.
 *
 * It is a background, not a hero: the colours are muted and never brightened past the ones listed,
 * so white text keeps its contrast over any part of it. The brightest colour is emerald #12936F at
 * 70% over black, with the grain on top of it: white on it is ≈ 6.5:1, and ≈ 6.3:1 under the glass
 * of a hovered button (the limit is 4.5:1). Blue and violet are darker still (≈ 10:1). It is the
 * PEAK_OPACITY that keeps the emerald in the limit: fully opaque it would be only 3.9:1.
 *
 * Cheap on purpose: it renders at half of the CSS size (CSS stretches the canvas), ignores the
 * device pixel ratio, and draws only while the smoke is alive. When it has faded and the pointer
 * stands still there is no animation frame at all; the next `pointermove` wakes the loop up. The
 * loop also sleeps while the tab is hidden. There is no CSS `blur()` on the canvas: the blur is in
 * the shader, where it costs nothing extra and leaves the grain sharp.
 */

/** The canvas is this share of its CSS size. The picture is soft anyway; CSS stretches it. */
const RENDER_SCALE = 0.5

/**
 * The smoke at the pointer: half of its width at half of its brightness, as a share of the shorter
 * side of the screen. ≈ 113 px on 1440 × 1024 (the width down to 10% of the brightness is ≈ 480 px).
 */
const SMOKE_RADIUS = 0.11
/** A Gaussian is at half of its height at sqrt(2 ln 2) sigmas, so sigma = radius / 1.1774. */
const SIGMA_PER_RADIUS = 1 / Math.sqrt(2 * Math.LN2)
/** How many times wider the smoke is when it is about to vanish than it is at the pointer. */
const SPREAD_END = 2.3
/** The most the smoke ever shows of its colour (its opacity over black), at the pointer. */
const PEAK_OPACITY = 0.7
/** The haze: this share of the brightness is spread over a Gaussian this many times wider. */
const HAZE_SHARE = 0.09
const HAZE_WIDTH = 2

/**
 * The path. `TRAIL_POINTS` is the length of the line the shader gets: the head (the smoothed
 * pointer itself) and the samples after it, the newest first. A sample is taken at the first frame
 * that is at least `SAMPLE_STEP_MS` after the previous one, and only if the pointer has moved since.
 * 39 samples × 44 ms ≈ 1.72 s: the oldest one is overwritten right when it has lived its life.
 */
const TRAIL_POINTS = 40
const RING_SIZE = TRAIL_POINTS - 1
const TRAIL_LIFE_MS = 1700
const SAMPLE_STEP_MS = 44
/** The head follows the pointer with this inertia, seconds (≈ 63% of the way): a smooth line. */
const FOLLOW_TAU_S = 0.07
/** The head is on the pointer when it is closer than this, CSS px. */
const SETTLED_PX = 0.25
/** Longest step of the follow, seconds: a slow frame does not make the head jump. */
const MAX_STEP_S = 0.1
/** The grain changes this many times per second (film-like). */
const GRAIN_FPS = 24

/**
 * The hue cycle: blue, violet, emerald, blue again. One turn takes this many seconds, on average,
 * so each colour has a third of it, 1.2 s, and the 1.7 s of a trail show two neighbouring colours.
 */
const HUE_CYCLE_S = 3.6
/** The cycle runs a little quicker and slower in turn (about ±25%): it does not repeat exactly. */
const HUE_WOBBLE_TURNS = 0.06
const HUE_WOBBLE_S = 5.3

/** "#RRGGBB" as a GLSL colour (sRGB, 0..1). */
function glslColor(hex: string): string {
  const value = parseInt(hex.slice(1), 16)
  const channel = (shift: number) => (((value >> shift) & 255) / 255).toFixed(4)
  return `vec3(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

const VERTEX_SOURCE = `
attribute vec2 a_corner;

void main() {
  gl_Position = vec4(a_corner, 0.0, 1.0);
}
`

/*
 * Units: canvas px, the origin is the bottom left corner (y goes up).
 */
const FRAGMENT_SOURCE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#define POINTS ${TRAIL_POINTS}

uniform float u_time;       // s since the smoke appeared: its slow drift
uniform float u_sigma;      // the spread (sigma of the Gaussian) of fresh smoke, px
uniform float u_seed;       // a new number GRAIN_FPS times per second: the grain
// The path of the pointer, the head first, then back in time. x, y: px; z: age, 0 (now) .. 1 (gone);
// w: the hue of the point, its place in the colour cycle (see cycleWeights), plus 1, if the line
// goes on from this point to the next (older) one, and minus that (so, below 0) if the line ends
// here.
uniform vec4 u_pts[POINTS];

const float PEAK = ${PEAK_OPACITY.toFixed(2)};
const float GRAIN = 0.07;                                // ±3.5% of the brightness, on the lit parts only
const float SPREAD = ${(SPREAD_END ** 2 - 1).toFixed(3)};  // sigma^2 grows with the age: 1 + SPREAD * age
const float HAZE = ${HAZE_SHARE.toFixed(2)};
const float HAZE_SCALE = ${(1 / HAZE_WIDTH ** 2).toFixed(4)};  // 1 / HAZE_WIDTH^2

// The colours: the hues of the young smoke, and where it goes when it gets old.
const vec3 BLUE = ${glslColor('#2438C8')};
const vec3 VIOLET = ${glslColor('#6B35C8')};
const vec3 EMERALD = ${glslColor('#12936F')};
// Halfway from violet to emerald. Their plain mix, #3F649C, is a dull steel blue; this is deeper
// and clearer, so the passage has no grey in it.
const vec3 AZURE = ${glslColor('#1F5899')};
const vec3 SLATE = ${glslColor('#24476B')};  // old blue and old violet
const vec3 TEAL = ${glslColor('#17505A')};   // old emerald
const vec3 NAVY = ${glslColor('#141B4D')};   // all of them, almost gone

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

// Value noise, 0..1, with quintic smoothing (no creases between the cells).
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// The hue of a point of the path (see u_pts).
float hueOf(vec4 pt) {
  return abs(pt.w) - 1.0;
}

// How much of each colour of the cycle (blue, violet, emerald) there is in a hue; the three add up
// to 1. A hue is a place in the cycle, in turns: 0 blue, 1/3 violet, 2/3 emerald, 1 blue again, and
// it goes on (2 is blue too), so it can be interpolated along the path with no jump at the turn.
// A colour is held pure for 0.4 of its third and gives way to the next along a smooth S, so the
// trail has zones of colour rather than a rainbow. Only two neighbours are ever mixed.
vec3 cycleWeights(float hue) {
  float place = fract(hue) * 3.0;
  vec3 gap = abs(mod(place - vec3(0.0, 1.0, 2.0) + 1.5, 3.0) - 1.5);  // to each colour, 0..1.5
  return 1.0 - smoothstep(0.2, 0.8, gap);
}

// Hue and age to colour: blue, violet or emerald when young; when old slate blue (blue, violet) or
// dark teal (emerald), and then navy. Blue and emerald ripen fully, violet only two thirds of the
// way, so a violet zone stays violet for longer.
// (The colours are those of the smoke at full strength; its opacity is applied by the caller.)
vec3 smokeColor(float hue, float age) {
  vec3 w = cycleWeights(hue);
  vec3 c = w.x * BLUE + w.y * VIOLET + w.z * EMERALD;
  // From violet to emerald: bent toward AZURE (w.y * w.z * 4 is 1 halfway and 0 at both colours).
  c += 4.0 * w.y * w.z * (AZURE - 0.5 * (VIOLET + EMERALD));
  c = mix(c, mix(SLATE, TEAL, w.z), smoothstep(0.1, 0.65, age) * (1.0 - 0.35 * w.y));
  return mix(c, NAVY, smoothstep(0.6, 1.0, age));
}

void main() {
  vec2 p = gl_FragCoord.xy;

  // Billows: slow noises, as big as the smoke. A fine and a coarse one bend the line (the older
  // the smoke, the more it follows the coarse one, see the loop), and a third one thins the old
  // smoke out into clouds.
  vec2 q = p / (u_sigma * 4.0) + vec2(0.0, u_time * 0.05);
  vec2 bendFine = (vec2(noise(q * 2.0), noise(q * 2.0 + 17.3)) - 0.5) * (0.4 * u_sigma);
  vec2 bendCoarse = (vec2(noise(q * 0.8 + 3.1), noise(q * 0.8 + 29.7)) - 0.5) * (1.2 * u_sigma);
  float cloud = 0.45 + 0.9 * noise(q * 1.3 + 8.9);

  // Every piece of the line is a segment between two neighbouring points. The nearest point of a
  // segment gives the distance and, interpolated between its ends, the age and the hue (so a fast
  // move leaves no beads). Segments never add up: the opacity is the strongest of them, and the
  // colour is an average of their colours, so the result is never brighter than the palette, also
  // where the line crosses itself. The average favours the more opaque segments: a fresh stroke
  // lies over an old one, and smoke that is about to vanish colours nothing. Its smooth weights keep
  // the colour from jumping where two pieces meet.
  float body = 0.0;
  float weight = 0.0;
  vec3 colorSum = vec3(0.0);
  for (int i = 1; i < POINTS; i++) {
    vec4 from = u_pts[i - 1];
    if (from.w < 0.0) continue;
    vec4 to = u_pts[i];

    vec2 at = p + mix(bendFine, bendCoarse, from.z);
    vec2 ab = to.xy - from.xy;
    float t = clamp(dot(at - from.xy, ab) / max(dot(ab, ab), 1.0), 0.0, 1.0);
    vec2 away = at - from.xy - ab * t;

    // The older, the wider: sigma^2 grows in step with the age, as it does in diffusion.
    float age = mix(from.z, to.z, t);
    float sigma = u_sigma * sqrt(1.0 + SPREAD * age);
    float x2 = dot(away, away) / (sigma * sigma);
    if (x2 > 50.0) continue;

    // Across the line: a Gaussian and, a little, a wider one (the haze). Along it: the smoke fades
    // out along a smooth S, and from the age of 0.1 on the clouds thin it out.
    float fade = 1.0 - smoothstep(0.12, 1.0, age);
    float profile = (1.0 - HAZE) * exp(-0.5 * x2) + HAZE * exp(-0.5 * x2 * HAZE_SCALE);
    float thin = mix(1.0, cloud, smoothstep(0.1, 0.7, age));
    float opacity = PEAK * fade * profile * thin;

    body = max(body, opacity);
    weight += opacity * opacity;
    colorSum += opacity * opacity * smokeColor(mix(hueOf(from), hueOf(to), t), age);
  }

  vec3 color = colorSum / max(weight, 0.000001) * body;

  // Film grain: multiplied in, so the black stays black. Where there is smoke, a little of the same
  // noise is added as well (a fraction of one 8-bit step, fading in with the smoke), so that the
  // faint end of the smoke does not break into visible contour lines. Where there is none: exact
  // black.
  float grain = hash(gl_FragCoord.xy + u_seed * 17.31) - 0.5;
  float lit = smoothstep(0.0, 0.01, body);
  vec3 dither = vec3(hash(gl_FragCoord.xy * 1.37 + u_seed * 5.77) - 0.5) * (1.5 / 255.0) * lit;
  gl_FragColor = vec4(color * (1.0 + grain * GRAIN) + dither, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (shader === null) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true) return shader
  if (import.meta.env.DEV) console.warn(gl.getShaderInfoLog(shader))
  gl.deleteShader(shader)
  return null
}

function link(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE)
  const program = gl.createProgram()
  if (vertex === null || fragment === null || program === null) return null

  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  // Once linked, the shaders themselves are not needed.
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (gl.getProgramParameter(program, gl.LINK_STATUS) === true) return program
  if (import.meta.env.DEV) console.warn(gl.getProgramInfoLog(program))
  gl.deleteProgram(program)
  return null
}

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

/**
 * The hue of a sample, from the moment it was taken: its place in the colour cycle, in turns
 * (0 blue, 1/3 violet, 2/3 emerald, 1 blue again). It only grows, it is never wrapped, so the
 * shader can interpolate it between two samples with no jump at the turn. The cycle runs a little
 * quicker and slower in turn, so the colours wander and do not repeat exactly.
 */
function hueAt(timeMs: number): number {
  const s = timeMs / 1000
  return s / HUE_CYCLE_S + HUE_WOBBLE_TURNS * Math.sin((s * 2 * Math.PI) / HUE_WOBBLE_S)
}

/** What the shader reads in the fourth number of a point: its hue plus 1 (so it is never 0), or the
 *  same with the sign flipped if the line ends at this point. */
function hueCode(hue: number, linked: boolean): number {
  return linked ? hue + 1 : -(hue + 1)
}

export interface FlowShader {
  /** Stops everything and gives the GPU resources (and the context itself) back. */
  destroy: () => void
}

/**
 * Starts the shader on the canvas, which must already be in the page: its CSS size sets the size
 * of the picture. Returns null if WebGL (or the shader) is not available. A context that is lost
 * later (the GPU resets) is reported through `onContextLost`, after which the shader is dead.
 * The canvas stays black until a pointer moves.
 */
export function createFlowShader(
  canvas: HTMLCanvasElement,
  onContextLost: () => void,
): FlowShader | null {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    // Decorative: on a laptop with two GPUs it does not need the fast one.
    powerPreference: 'low-power',
  })
  if (gl === null) return null

  const program = link(gl)
  const buffer = gl.createBuffer()
  const releaseContext = () => gl.getExtension('WEBGL_lose_context')?.loseContext()
  if (program === null || buffer === null) {
    releaseContext()
    return null
  }

  // One triangle that covers the screen.
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const corner = gl.getAttribLocation(program, 'a_corner')
  gl.enableVertexAttribArray(corner)
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0)
  gl.useProgram(program)
  gl.clearColor(0, 0, 0, 1)

  const uniforms = {
    time: gl.getUniformLocation(program, 'u_time'),
    sigma: gl.getUniformLocation(program, 'u_sigma'),
    seed: gl.getUniformLocation(program, 'u_seed'),
    points: gl.getUniformLocation(program, 'u_pts'),
  }

  // Canvas size, px, its CSS size, and the spread of fresh smoke on the canvas (px).
  let width = 1
  let height = 1
  let cssWidth = 1
  let cssHeight = 1
  let sigma = 1

  // The pointer, CSS px from the top left corner, and when it last moved (performance.now()).
  let pointerX = 0
  let pointerY = 0
  let lastMoveTime = -Infinity
  // The head of the path: the pointer, smoothed. `headLinked`: the line goes on from the head to
  // the newest sample (false: the head starts a new stroke).
  let headX = 0
  let headY = 0
  let headLinked = false
  // The clock of the billows: the moment the smoke appeared.
  let clockStart = 0

  // The samples: a ring of the places of the head (CSS px), their hues, and when the head was
  // there. A sample is `linked` to the next older one unless the stroke began there. `ringNext` is
  // the slot the next sample goes to.
  const ringX = new Float32Array(RING_SIZE)
  const ringY = new Float32Array(RING_SIZE)
  const ringHue = new Float32Array(RING_SIZE)
  const ringTime = new Float64Array(RING_SIZE)
  const ringLinked = new Uint8Array(RING_SIZE)
  let ringNext = 0
  let ringCount = 0
  let lastSampleTime = -Infinity
  let movedSinceSample = false
  // The pointer is about to appear somewhere else (it left the window, a new touch began, the tab
  // was hidden): the line must not be drawn from where it was to where it is.
  let breakPending = false

  // What the shader gets: the line (x, y, age, hue and link).
  const points = new Float32Array(TRAIL_POINTS * 4)

  // The head dies last: it is as old as the last move of the pointer. Nothing is alive after that.
  const isAlive = (now: number) => now - lastMoveTime < TRAIL_LIFE_MS

  const pushSample = (time: number) => {
    ringX[ringNext] = headX
    ringY[ringNext] = headY
    ringTime[ringNext] = time
    ringHue[ringNext] = hueAt(time)
    ringLinked[ringNext] = headLinked ? 1 : 0
    ringNext = (ringNext + 1) % RING_SIZE
    ringCount = Math.min(ringCount + 1, RING_SIZE)
    lastSampleTime = time
    movedSinceSample = false
    headLinked = true
  }

  // Writes the line for the shader: the head (age from the last move of the pointer), then the
  // samples from the newest to the oldest. The first sample that has lived its life ends the line
  // (age 1, it is invisible); the rest of the array repeats it.
  const fillPoints = (now: number) => {
    const scaleX = width / cssWidth
    const scaleY = height / cssHeight
    let x = headX * scaleX
    let y = height - headY * scaleY
    points[0] = x
    points[1] = y
    points[2] = clampUnit((now - lastMoveTime) / TRAIL_LIFE_MS)
    points[3] = hueCode(hueAt(lastMoveTime), headLinked)

    let filled = 1
    for (let i = 0; i < ringCount; i++) {
      const slot = (ringNext - 1 - i + RING_SIZE) % RING_SIZE
      const age = clampUnit((now - ringTime[slot]) / TRAIL_LIFE_MS)
      x = ringX[slot] * scaleX
      y = height - ringY[slot] * scaleY
      const at = filled * 4
      points[at] = x
      points[at + 1] = y
      points[at + 2] = age
      points[at + 3] = hueCode(ringHue[slot], age < 1 && ringLinked[slot] === 1)
      filled += 1
      if (age >= 1) break
    }
    for (; filled < TRAIL_POINTS; filled++) {
      const at = filled * 4
      points[at] = x
      points[at + 1] = y
      points[at + 2] = 1
      points[at + 3] = hueCode(0, false)
    }
  }

  const clear = () => gl.clear(gl.COLOR_BUFFER_BIT)

  const draw = (now: number) => {
    fillPoints(now)
    gl.uniform1f(uniforms.time, (now - clockStart) / 1000)
    gl.uniform1f(uniforms.sigma, sigma)
    gl.uniform1f(uniforms.seed, Math.floor((now / 1000) * GRAIN_FPS) % 997)
    gl.uniform4fv(uniforms.points, points)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  let frameId = 0
  let lastFrameTime = 0

  const frame = (now: number) => {
    frameId = 0
    // The smoke has faded and the pointer stands still: one black frame, and the loop ends.
    if (!isAlive(now)) {
      clear()
      return
    }

    const step = Math.min(Math.max((now - lastFrameTime) / 1000, 0), MAX_STEP_S)
    lastFrameTime = now

    // The head follows the pointer with a little inertia: the line is smooth whatever the rate and
    // the jitter of the pointer events.
    const follow = 1 - Math.exp(-step / FOLLOW_TAU_S)
    headX += (pointerX - headX) * follow
    headY += (pointerY - headY) * follow
    if (Math.hypot(pointerX - headX, pointerY - headY) < SETTLED_PX) {
      headX = pointerX
      headY = pointerY
    }

    if (movedSinceSample && lastMoveTime - lastSampleTime >= SAMPLE_STEP_MS) {
      pushSample(lastMoveTime)
    }

    draw(now)
    frameId = requestAnimationFrame(frame)
  }

  // Starts the loop if it is not running (a pointer move, a resize, the tab is back).
  const wake = () => {
    if (frameId !== 0 || document.hidden) return
    lastFrameTime = performance.now()
    frameId = requestAnimationFrame(frame)
  }

  const stop = () => {
    cancelAnimationFrame(frameId)
    frameId = 0
  }

  // Resizing clears the canvas, so live smoke is drawn again at once. The samples are CSS px, so
  // they stay valid; only the spread changes.
  const resize = () => {
    cssWidth = Math.max(canvas.clientWidth, 1)
    cssHeight = Math.max(canvas.clientHeight, 1)
    width = Math.max(Math.round(cssWidth * RENDER_SCALE), 1)
    height = Math.max(Math.round(cssHeight * RENDER_SCALE), 1)
    sigma = Math.max(SMOKE_RADIUS * SIGMA_PER_RADIUS * Math.min(width, height), 1)
    canvas.width = width
    canvas.height = height
    gl.viewport(0, 0, width, height)
    clear()
    const now = performance.now()
    if (isAlive(now)) draw(now)
    wake()
  }

  // Any pointer is a cursor here: a mouse, a pen, a finger that drags. They all end up here: the
  // pointer is at (x, y) now, CSS px.
  const moveTo = (x: number, y: number) => {
    const now = performance.now()

    if (!isAlive(now)) {
      // Nothing on the screen: a new stroke begins right here, with no line from where the old one
      // ended.
      ringCount = 0
      ringNext = 0
      headX = x
      headY = y
      headLinked = false
      clockStart = now
    } else if (breakPending) {
      // The pointer came back from somewhere else: close the old stroke where it stopped. (A slow
      // frame is no reason: the browser then merges the moves into one with a big step, but the
      // pointer did travel through all of it.)
      pushSample(lastMoveTime)
      headX = x
      headY = y
      headLinked = false
    }
    breakPending = false

    pointerX = x
    pointerY = y
    lastMoveTime = now
    movedSinceSample = true
    wake()
  }

  // A finger that drags is followed by the touch events, not the pointer ones. The page keeps
  // `touch-action: auto` (pinch-zoom must work), so the browser takes such a drag over for panning
  // and zooming and cancels the finger's pointer events a move or two after it began; the touch
  // events go on. Their listeners are passive: they never hold the gesture up. Once the browser has
  // shown it has touch events, the finger's pointer events are skipped, so a move is not taken
  // twice (without touch events, e.g. in a browser that has pointer events only, they still draw).
  let touchEvents = false

  const handlePointerMove = (event: PointerEvent) => {
    if (touchEvents && event.pointerType === 'touch') return
    moveTo(event.clientX, event.clientY)
  }

  // A mouse that left the window comes back somewhere else. A finger or a pen that touches down
  // starts a new stroke where it lands (a mouse button pressed on the spot does not).
  const handlePointerLeave = (event: PointerEvent) => {
    // A finger "leaves" when the browser takes its drag over: that is no break in the stroke.
    if (touchEvents && event.pointerType === 'touch') return
    breakPending = true
  }

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') breakPending = true
  }

  // The first finger draws the stroke. A new touch begins a new stroke where it lands, and one that
  // ends (or is taken over for good, `touchcancel`) closes it: no line to the next place it lands.
  const handleTouchStart = () => {
    touchEvents = true
    breakPending = true
  }

  const handleTouchMove = (event: TouchEvent) => {
    const finger = event.touches.item(0)
    if (finger !== null) moveTo(finger.clientX, finger.clientY)
  }

  const handleTouchEnd = () => {
    breakPending = true
  }

  const handleVisibilityChange = () => {
    if (document.hidden) {
      stop()
      breakPending = true
    } else {
      // Back: the smoke is drawn again, or, if it has faded meanwhile, the canvas is cleared.
      wake()
    }
  }

  const detach = () => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerdown', handlePointerDown)
    window.removeEventListener('touchstart', handleTouchStart)
    window.removeEventListener('touchmove', handleTouchMove)
    window.removeEventListener('touchend', handleTouchEnd)
    window.removeEventListener('touchcancel', handleTouchEnd)
    document.documentElement.removeEventListener('pointerleave', handlePointerLeave)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    stop()
  }

  const handleContextLost = (event: Event) => {
    // Without this the browser would never offer the context again, and nothing could use it.
    event.preventDefault()
    detach()
    onContextLost()
  }

  window.addEventListener('pointermove', handlePointerMove, { passive: true })
  window.addEventListener('pointerdown', handlePointerDown, { passive: true })
  window.addEventListener('touchstart', handleTouchStart, { passive: true })
  window.addEventListener('touchmove', handleTouchMove, { passive: true })
  window.addEventListener('touchend', handleTouchEnd, { passive: true })
  window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
  document.documentElement.addEventListener('pointerleave', handlePointerLeave)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('resize', resize)
  canvas.addEventListener('webglcontextlost', handleContextLost)
  resize()

  return {
    destroy() {
      detach()
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      if (gl.isContextLost()) return
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      releaseContext()
    },
  }
}
