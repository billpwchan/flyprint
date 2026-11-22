// The mark: one flight leaving home over the curve of the earth, drawn as a
// contrail that is faint where it began and full where it is now. One
// geometry serves the header, the link picture, the year card, the app icon
// and the README cover; plain JS so the build scripts can import it too.

/**
 * A quadratic arc drawn as a filled band that widens from start to end.
 * @param {[number, number]} from @param {[number, number]} control @param {[number, number]} to
 * @param {number} startWidth @param {number} endWidth
 */
export function contrail(from, control, to, startWidth, endWidth, steps = 48) {
  const at = (t) => [
    (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * control[0] + t * t * to[0],
    (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * control[1] + t * t * to[1],
  ];
  const heading = (t) => {
    const dx = 2 * (1 - t) * (control[0] - from[0]) + 2 * t * (to[0] - control[0]);
    const dy = 2 * (1 - t) * (control[1] - from[1]) + 2 * t * (to[1] - control[1]);
    const length = Math.hypot(dx, dy);
    return [dx / length, dy / length];
  };
  const left = [], right = [];
  for (let step = 0; step <= steps; step++) {
    const t = step / steps, [x, y] = at(t), [dx, dy] = heading(t);
    const half = (startWidth + (endWidth - startWidth) * t ** 0.8) / 2;
    left.push([x - dy * half, y + dx * half]);
    right.push([x + dy * half, y - dx * half]);
  }
  const line = (points) => points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L");
  return `M${line(left)}L${line(right.reverse())}Z`;
}

export const MARK = {
  width: 52,
  height: 44,
  horizon: "M1 42.5Q26 33 51 42.5",
  trail: contrail([4, 40], [26, -10], [48, 40], 0.6, 4),
  home: { x: 4, y: 40, r: 3 },
  head: { x: 48, y: 40, r: 2.2 },
  colors: { horizon: "rgba(143,182,230,0.5)", trailFrom: "rgba(238,242,246,0.25)", trailMid: "rgba(238,242,246,0.9)", trailTo: "#ffffff", home: "#f3cf7f", head: "#ffffff" },
};

/** The mark as SVG markup in its own 52×44 units, for pictures drawn as SVG. @param {string} id */
export function markSvg(id) {
  const { horizon, trail, home, head, colors } = MARK;
  return `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${colors.trailFrom}"/><stop offset=".55" stop-color="${colors.trailMid}"/><stop offset="1" stop-color="${colors.trailTo}"/></linearGradient></defs>`
    + `<path d="${horizon}" fill="none" stroke="${colors.horizon}" stroke-width=".8"/>`
    + `<path d="${trail}" fill="url(#${id})"/>`
    + `<circle cx="${home.x}" cy="${home.y}" r="${home.r}" fill="${colors.home}"/><circle cx="${head.x}" cy="${head.y}" r="${head.r}" fill="${colors.head}"/>`;
}
