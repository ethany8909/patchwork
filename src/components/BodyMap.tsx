import { AREA_LABELS, BACK, EXTRA_AREAS, FRONT, areaLabel, type Region, type Shape } from "../data/body";
import { Icon } from "./Icon";

/** Cropped to the outline itself (it spans x 35-165, y 12-450) so the figures draw as large as possible. */
const VIEWBOX = "28 8 144 446";

/** Every area on the outlines, A-Z, for picking from a list instead of tapping small shapes. */
const OUTLINE_AREAS = [...new Set([...FRONT, ...BACK].map((r) => r.id))].sort((a, b) => areaLabel(a).localeCompare(areaLabel(b)));

function ShapeEl({ s }: { s: Shape }) {
  return s.kind === "rect"
    ? <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} />
    : <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />;
}

function Figure({ regions, label, selected, onToggle, counts }: {
  regions: Region[];
  label: string;
  selected: string[];
  onToggle?: (id: string) => void;
  counts?: Map<string, number>;
}) {
  const max = counts ? Math.max(1, ...counts.values()) : 1;
  return (
    <figure class="body-fig">
      <svg viewBox={VIEWBOX} role="group" aria-label={`${label} of body`}>
        {regions.map((r) => {
          const on = selected.includes(r.id);
          const n = counts?.get(r.id) ?? 0;
          const heat = counts ? n / max : 0;
          const common = {
            class: `region ${on ? "region--on" : ""} ${counts ? "region--heat" : ""}`,
            style: counts ? { "--heat": String(heat) } : undefined,
          };
          if (!onToggle) {
            return (
              <g {...common} aria-label={`${areaLabel(r.id)}${counts ? `: ${n} days` : ""}`} role="img">
                {r.shapes.map((s) => <ShapeEl s={s} />)}
              </g>
            );
          }
          return (
            <g
              {...common}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={areaLabel(r.id)}
              onClick={() => onToggle(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(r.id);
                }
              }}
            >
              <title>{areaLabel(r.id)}</title>
              {r.shapes.map((s) => <ShapeEl s={s} />)}
            </g>
          );
        })}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function BodyMap({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const toggle = onToggle;
  return (
    <div class="body-map">
      <div class="body-map__figs">
        <Figure regions={FRONT} label="Front" selected={selected} onToggle={toggle} />
        <Figure regions={BACK} label="Back" selected={selected} onToggle={toggle} />
      </div>
      <div class="chips" aria-label="Other areas">
        {EXTRA_AREAS.map((id) => (
          <button type="button" class="chip" aria-pressed={selected.includes(id)} onClick={() => toggle(id)}>
            {selected.includes(id) && <Icon name="check" size={16} />}
            {AREA_LABELS[id]}
          </button>
        ))}
      </div>
      <details class="explainer">
        <summary>Choose from a list instead</summary>
        <div class="chips" aria-label="All areas">
          {OUTLINE_AREAS.map((id) => (
            <button type="button" class="chip" aria-pressed={selected.includes(id)} onClick={() => toggle(id)}>
              {selected.includes(id) && <Icon name="check" size={16} />}
              {areaLabel(id)}
            </button>
          ))}
        </div>
      </details>
      <p class="muted small" aria-live="polite">
        {selected.length ? `Selected: ${selected.map(areaLabel).join(", ")}` : "Tap every area that's affected."}
      </p>
    </div>
  );
}

/** Read-only heat map of how often each area was affected. */
export function BodyHeat({ counts }: { counts: [string, number][] }) {
  const m = new Map(counts);
  return (
    <div class="body-map__figs body-map__figs--small">
      <Figure regions={FRONT} label="Front" selected={[]} counts={m} />
      <Figure regions={BACK} label="Back" selected={[]} counts={m} />
    </div>
  );
}
