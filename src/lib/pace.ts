// how fast a watching phone traces in the lines it received: evenly until the next batch should land
export const PACE_MS = 330; // a batch is spread over about the time until the next one arrives (poll 250 ms + a margin)
export const CATCH_UP_MS = 400; // a big backlog (joined late, back from a pause) is drawn in quickly instead
const BIG = 300; // points

/** points on screen after `dt` ms, when `total` have arrived and the batch should be done `left` ms from now */
export function advance(shown: number, total: number, dt: number, left: number) {
  const todo = total - shown;
  if (todo <= 0) return total;
  const time = Math.min(Math.max(16, left), todo > BIG ? CATCH_UP_MS : Infinity);
  return Math.min(total, shown + Math.max(todo * (dt / time), 0.25));
}
