// Daily itch as columns. One series, so one hue and no legend box; the flare
// threshold is a labeled hairline, days without a log are a muted baseline tick.
// Hover, touch, or arrow keys show a tooltip; a table view carries every value too.

import { useEffect, useRef, useState } from "preact/hooks";
import { formatDate } from "../lib/date";
import { FLARE_ITCH } from "../lib/insights";
import { SLEEP_OPTIONS } from "../data/options";
import type { ISODate } from "../lib/types";

interface Point { date: ISODate; itch: number | null; sleep: number | null }

const H = 200;
const PAD = { top: 14, right: 8, bottom: 26, left: 26 };

/**
 * The SVG is drawn at the container's real pixel width (not scaled from a fixed
 * design size), so axis text stays a readable 12px on a phone.
 */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(260, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function ItchChart({ series, print = false }: { series: Point[]; print?: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const [plotRef, W] = useWidth(print ? 680 : 340);
  const n = series.length;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, n);
  const barW = Math.min(24, Math.max(2, slot - 2)); // 2px surface gap between bars
  const y = (v: number) => PAD.top + plotH - (v / 10) * plotH;
  const xMid = (i: number) => PAD.left + slot * i + slot / 2;

  const labelIdx = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];
  const logged = series.filter((p) => p.itch !== null).length;

  const tip = active !== null ? series[active] : null;

  const onMove = (e: PointerEvent) => {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.floor((x - PAD.left) / slot);
    setActive(i >= 0 && i < n ? i : null);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? n) - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  return (
    <div class={`chart ${print ? "chart--print" : ""}`}>
      <div class="chart__plot" ref={plotRef}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Daily worst itch, ${formatDate(series[0]?.date ?? "")} to ${formatDate(series[n - 1]?.date ?? "")}. ${logged} of ${n} days logged. Use arrow keys to read each day.`}
          tabIndex={print ? undefined : 0}
          onPointerMove={print ? undefined : onMove}
          onPointerDown={print ? undefined : onMove}
          onPointerLeave={print ? undefined : () => setActive(null)}
          onKeyDown={print ? undefined : onKey}
          onBlur={() => setActive(null)}
        >
          {[0, 5, 10].map((v) => (
            <g>
              <line class="chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
              <text class="chart__tick" x={PAD.left - 8} y={y(v) + 4} text-anchor="end">{v}</text>
            </g>
          ))}
          <line class="chart__threshold" x1={PAD.left} x2={W - PAD.right} y1={y(FLARE_ITCH)} y2={y(FLARE_ITCH)} />
          <text class="chart__threshold-label" x={W - PAD.right} y={y(FLARE_ITCH) - 5} text-anchor="end">flare (7+)</text>

          {active !== null && (
            <rect class="chart__hover" x={PAD.left + slot * active} y={PAD.top} width={slot} height={plotH} />
          )}

          {series.map((p, i) => {
            const x = xMid(i) - barW / 2;
            if (p.itch === null) {
              return <rect class="chart__missing" x={x} y={y(0) - 2} width={barW} height={2} rx={1} />;
            }
            const top = y(Math.max(p.itch, 0.25));
            const h = y(0) - top;
            const r = Math.min(4, barW / 2, h);
            // 4px rounded data-end, square at the baseline
            const d = `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${y(0)} Z`;
            return <path class={`chart__bar ${active === i ? "chart__bar--active" : ""}`} d={d} />;
          })}

          <line class="chart__axis" x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} />
          {labelIdx.map((i, k) => (
            <text
              class="chart__tick"
              x={xMid(i)}
              y={H - 8}
              text-anchor={k === 0 ? "start" : k === labelIdx.length - 1 ? "end" : "middle"}
            >
              {formatDate(series[i].date)}
            </text>
          ))}
        </svg>
        {tip && (
          <div
            class="chart__tip"
            role="status"
            style={{ left: `${Math.min(W - 64, Math.max(64, xMid(active!)))}px` }}
          >
            <strong>{tip.itch === null ? "No log" : `Itch ${tip.itch}/10`}</strong>
            <span>{formatDate(tip.date, { weekday: "short", month: "short", day: "numeric" })}</span>
            {tip.sleep !== null && tip.itch !== null && <span>{SLEEP_OPTIONS[tip.sleep]?.label}</span>}
          </div>
        )}
      </div>
      {!print && (
        <details class="chart__table">
          <summary>Show as a table</summary>
          <table>
            <thead><tr><th scope="col">Date</th><th scope="col">Worst itch</th><th scope="col">Sleep</th></tr></thead>
            <tbody>
              {series.filter((p) => p.itch !== null).slice().reverse().map((p) => (
                <tr>
                  <td>{formatDate(p.date, { weekday: "short", month: "short", day: "numeric" })}</td>
                  <td>{p.itch}/10</td>
                  <td>{p.sleep !== null ? SLEEP_OPTIONS[p.sleep]?.label : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
