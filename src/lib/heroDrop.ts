/**
 * Home hero: where each falling slip (style --slot, from -1 = left of the opening to 1 = right) lands in the bowl.
 * Measured, not guessed: the words are random, so every slip has its own width. The landing point is picked so the slip's
 * lower corners sit inside the bowl's curve, and the throw arcs over the rim, so it never cuts through the wall.
 * The drop-in keyframes (globals.css) read --dx/--dy (landing, px), --v (the toss: upward start, px) and --s (final scale).
 */
export function aimDrops(hero: HTMLElement) {
  const svg = hero.querySelector("svg");
  if (!svg) return;
  const h = hero.getBoundingClientRect();
  const b = svg.getBoundingClientRect();
  const k = b.width / 120; // the bowl path (ui.tsx): rim at y 34 from x 6 to 114, 42 deep at its middle
  const cx = b.left - h.left + 60 * k;
  const rim = b.top - h.top + 34 * k;
  const half = 54 * k;
  const deep = 42 * k;
  const s = 0.5; // the slip shrinks as it falls in: further away, and the bowl stays the bigger thing
  for (const el of hero.querySelectorAll<HTMLElement>(".drop-in")) {
    const w = el.offsetWidth * s;
    const tall = el.offsetHeight * s;
    let x = cx + Number(getComputedStyle(el).getPropertyValue("--slot") || 0) * half;
    let sink = tall * 0.55; // about half of it shows above the rim, like the slips already in the bowl
    // lower corners inside the curve (≈ an ellipse), with room for the slip's tilt; closer to the middle, then shallower
    const fits = () => ((Math.abs(x - cx) + w / 2 + tall * 0.2) / half) ** 2 + (sink / deep) ** 2 <= 0.8;
    while (!fits() && Math.abs(x - cx) >= 1) x -= Math.sign(x - cx);
    while (!fits() && sink > 1) sink -= 1;
    // untransformed layout box; the scale works from the bottom middle (transform-origin), so that's the point that travels
    const dx = x - (el.offsetLeft + el.offsetWidth / 2);
    const dy = rim + sink - (el.offsetTop + el.offsetHeight);
    el.style.setProperty("--dx", `${dx.toFixed(1)}px`);
    el.style.setProperty("--dy", `${dy.toFixed(1)}px`);
    el.style.setProperty("--v", `${(-Math.max(16, Math.abs(dy) * 0.45)).toFixed(1)}px`);
    el.style.setProperty("--s", String(s));
  }
}
