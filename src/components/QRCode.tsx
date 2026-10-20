// Renders a QR code as SVG from the module matrix (no innerHTML, so it's CSP-safe).

import qrcode from "qrcode-generator";

export function QRCode({ text, size = 200, label }: { text: string; size?: number; label: string }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4; // quiet zone the QR spec requires around the code
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + quiet},${r + quiet}h1v1h-1z`;
    }
  }
  const total = n + quiet * 2;
  return (
    <svg class="qr" width={size} height={size} viewBox={`0 0 ${total} ${total}`} role="img" aria-label={label} shape-rendering="crispEdges">
      <rect width={total} height={total} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
