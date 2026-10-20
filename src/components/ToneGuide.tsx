// Simplified drawings (not photographs) of how an eczema patch can differ from the skin
// around it on four skin tones. Drawn in code, so there are no image rights involved,
// and every swatch is described in words so color is never the only channel.

const TONES = [
  { skin: "#f3d6c3", patch: "#e29a8f", scale: "#fbeee8", tone: "Light skin", look: "Pink or red, slightly raised" },
  { skin: "#d6a57e", patch: "#a8665a", scale: "#ead8cc", tone: "Medium skin", look: "Pink-brown or darker brown" },
  { skin: "#8d5a3b", patch: "#5b3a3f", scale: "#b9a9a3", tone: "Brown skin", look: "Darker brown, purple or gray" },
  { skin: "#4e3021", patch: "#3a2a2c", scale: "#8f8580", tone: "Deep brown skin", look: "Dark, gray or ashy, often dry" },
];

export function ToneGuide() {
  return (
    <figure class="tone-guide">
      <div class="tone-guide__grid">
        {TONES.map((t, i) => (
          <div class="tone-guide__item">
            <svg viewBox="0 0 120 90" role="img" aria-label={`${t.tone}: ${t.look}`}>
              <rect width="120" height="90" rx="12" fill={t.skin} />
              <path d="M30 28c12-14 44-12 58 0s14 34-4 40-46 6-56-8-8-24 2-32z" fill={t.patch} opacity="0.92" />
              {Array.from({ length: 9 }, (_, k) => (
                <rect x={38 + ((k * 23) % 44)} y={34 + ((k * 13) % 26)} width={5 + (k % 3)} height={2} rx={1} fill={t.scale} opacity="0.85" key={`${i}-${k}`} />
              ))}
            </svg>
            <figcaption>
              <strong>{t.tone}</strong>
              <span>{t.look}</span>
            </figcaption>
          </div>
        ))}
      </div>
      <p class="tone-guide__note">Simplified drawings, not medical photos. Real skin varies a lot, so compare a patch with your own normal skin nearby.</p>
    </figure>
  );
}
