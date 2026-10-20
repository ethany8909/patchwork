// Weekly POEM scores as bars on a 0-28 scale, every bar labeled with its value, with
// the moderate (8) and severe (17) band edges marked. Includes a table for screen readers.

import { formatDate } from "../lib/date";
import { POEM_MAX, poemBand } from "../lib/poem";
import type { ISODate } from "../lib/types";

const W = 320;
const H = 150;
const PAD = { top: 18, right: 8, bottom: 22, left: 26 };

export function PoemChart({ points, print = false }: { points: { date: ISODate; score: number }[]; print?: boolean }) {
  const shown = points.slice(-10);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - (v / POEM_MAX) * plotH;
  const slot = plotW / Math.max(shown.length, 4);
  const barW = Math.min(24, slot * 0.6);

  return (
    <div class={`chart ${print ? "chart--print" : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weekly POEM scores: ${shown.map((p) => `${formatDate(p.date)} ${p.score}`).join(", ")}`}>
        {[0, 7, 14, 21, 28].map((v) => (
          <g>
            <line class="chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text class="chart__tick" x={PAD.left - 6} y={y(v) + 4} text-anchor="end">{v}</text>
          </g>
        ))}
        {[{ v: 8, label: "Moderate" }, { v: 17, label: "Severe" }].map((t) => (
          <g>
            <line class="chart__threshold" x1={PAD.left} x2={W - PAD.right} y1={y(t.v - 0.5)} y2={y(t.v - 0.5)} stroke-dasharray="3 3" />
            <text class="chart__threshold-label" x={W - PAD.right} y={y(t.v - 0.5) - 3} text-anchor="end">{t.label}</text>
          </g>
        ))}
        {shown.map((p, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          return (
            <g>
              <rect class="chart__bar" x={cx - barW / 2} y={y(p.score)} width={barW} height={Math.max(1, y(0) - y(p.score))} rx={3} />
              <text class="chart__tick" x={cx} y={y(p.score) - 4} text-anchor="middle">{p.score}</text>
              <text class="chart__tick" x={cx} y={H - 6} text-anchor="middle">{formatDate(p.date, { month: "numeric", day: "numeric" })}</text>
            </g>
          );
        })}
        <line class="chart__axis" x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} />
      </svg>
      {!print && (
        <details class="chart__table">
          <summary>Show as a table</summary>
          <table>
            <thead><tr><th>Week of</th><th>Score</th><th>Band</th></tr></thead>
            <tbody>
              {[...shown].reverse().map((p) => (
                <tr><td>{formatDate(p.date, { month: "short", day: "numeric", year: "numeric" })}</td><td>{p.score}</td><td>{poemBand(p.score).label}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
