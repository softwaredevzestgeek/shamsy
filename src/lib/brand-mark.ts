/** The Shamsy mark (sun on deep green) as an SVG string, shared by every icon route. */
export function brandMarkSvg({ rounded = true }: { rounded?: boolean } = {}): string {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((deg) => `<line x1="32" y1="9" x2="32" y2="15" transform="rotate(${deg} 32 32)"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f5446"/><stop offset="1" stop-color="#062a22"/></linearGradient>
<radialGradient id="sun" cx="0.38" cy="0.35" r="0.75"><stop offset="0" stop-color="#ffe7a3"/><stop offset="0.55" stop-color="#fbbf3c"/><stop offset="1" stop-color="#f59e0b"/></radialGradient>
</defs>
<rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="url(#bg)"/>
<g stroke="#fbbf3c" stroke-width="4" stroke-linecap="round">${rays}</g>
<circle cx="32" cy="32" r="11" fill="url(#sun)"/>
</svg>`;
}
