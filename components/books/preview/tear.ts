const VIEW_W = 1000;
const SHEET_H = 1000;
const EDGE_H = 60;

// Seeded so the server and the client draw the same rip.
function tearLine(seed: number): string {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const points: string[] = [];
  let y = EDGE_H / 2;
  for (let x = 0; x <= VIEW_W; x += 6) {
    const spike = rand() < 0.08 ? (rand() - 0.5) * 30 : 0;
    y += (rand() - 0.5) * 10 + spike;
    y = Math.min(EDGE_H - 8, Math.max(8, y));
    points.push(`L${x},${(SHEET_H + y).toFixed(1)}`);
  }
  return points.join(' ');
}

// A full sheet with a ragged bottom edge, used as a luminance-agnostic alpha mask.
// The fainter second edge reads as loose paper fibres.
const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${VIEW_W} ${SHEET_H + EDGE_H}' preserveAspectRatio='none'>
<path d='M0,0 ${tearLine(19)} L${VIEW_W},0 Z' fill='black' opacity='0.5' transform='translate(0 6)'/>
<path d='M0,0 ${tearLine(7)} L${VIEW_W},0 Z' fill='black'/>
</svg>`;

/** CSS for the outgoing frame's wrapper: the sheet mask, sized so the edge hangs 6% below the frame. */
export const TEAR_MASK_STYLE = {
  maskImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
  maskSize: '100% 106%',
  maskRepeat: 'no-repeat',
  maskPosition: 'top',
} as const;
