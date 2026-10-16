/** Archivos de ejemplo para el seed: ilustraciones SVG y una nota de voz WAV generada. */

export const PACKAGING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" width="640" height="480">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ccfbf1"/><stop offset="1" stop-color="#cffafe"/></linearGradient>
    <linearGradient id="bag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#115e59"/><stop offset="1" stop-color="#134e4a"/></linearGradient>
  </defs>
  <rect width="640" height="480" fill="url(#bg)"/>
  <circle cx="520" cy="90" r="60" fill="#a7f3d0" opacity=".6"/>
  <circle cx="110" cy="400" r="80" fill="#a5f3fc" opacity=".5"/>
  <path d="M230 110 h180 l20 40 v250 a16 16 0 0 1 -16 16 h-188 a16 16 0 0 1 -16 -16 v-250z" fill="url(#bag)"/>
  <path d="M230 110 h180 l20 40 h-220z" fill="#0f766e"/>
  <rect x="250" y="190" width="140" height="150" rx="12" fill="#f0fdfa"/>
  <text x="320" y="228" font-family="Georgia, serif" font-size="26" fill="#134e4a" text-anchor="middle">Geisha</text>
  <text x="320" y="252" font-family="Arial, sans-serif" font-size="11" letter-spacing="3" fill="#0f766e" text-anchor="middle">HUILA · 1.850 MSNM</text>
  <path d="M290 280 q30 -30 60 0 q-30 30 -60 0z" fill="#10b981"/>
  <line x1="290" y1="280" x2="350" y2="280" stroke="#065f46" stroke-width="2"/>
  <text x="320" y="320" font-family="Arial, sans-serif" font-size="12" fill="#115e59" text-anchor="middle">Notas: jazmín · durazno · miel</text>
  <text x="320" y="440" font-family="Arial, sans-serif" font-size="14" fill="#134e4a" text-anchor="middle">Café Andino — propuesta de empaque v3</text>
</svg>`;

export const ROUTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">
  <rect width="640" height="400" fill="#f0fdfa"/>
  <g stroke="#ccfbf1" stroke-width="18" fill="none" stroke-linecap="round">
    <path d="M0 120 H640"/><path d="M0 290 H640"/><path d="M160 0 V400"/><path d="M450 0 V400"/>
  </g>
  <path d="M90 330 C 160 290, 170 170, 250 150 S 400 230, 450 120 S 560 70, 580 60" stroke="#0d9488" stroke-width="6" fill="none" stroke-dasharray="14 10" stroke-linecap="round"/>
  <g font-family="Arial, sans-serif" font-size="13" fill="#134e4a">
    <circle cx="90" cy="330" r="14" fill="#0f766e"/><text x="112" y="335">Bodega Puente Aranda</text>
    <circle cx="250" cy="150" r="11" fill="#10b981"/><text x="268" y="146">1. Chapinero</text>
    <circle cx="450" cy="120" r="11" fill="#10b981"/><text x="468" y="116">2. Usaquén</text>
    <circle cx="580" cy="60" r="11" fill="#06b6d4"/><text x="470" y="40">3. Cedritos</text>
  </g>
  <rect x="20" y="20" width="200" height="56" rx="10" fill="#ffffff" stroke="#99f6e4"/>
  <text x="36" y="44" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#134e4a">Ruta jueves</text>
  <text x="36" y="64" font-family="Arial, sans-serif" font-size="12" fill="#0f766e">3 paradas · 38 km · 2 h 10 min</text>
</svg>`;

export const WIREFRAME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" width="640" height="420">
  <rect width="640" height="420" fill="#ecfeff"/>
  <rect x="40" y="30" width="560" height="360" rx="14" fill="#ffffff" stroke="#a5f3fc" stroke-width="2"/>
  <rect x="40" y="30" width="560" height="44" rx="14" fill="#155e75"/>
  <circle cx="68" cy="52" r="6" fill="#67e8f9"/><circle cx="88" cy="52" r="6" fill="#5eead4"/><circle cx="108" cy="52" r="6" fill="#6ee7b7"/>
  <rect x="70" y="100" width="250" height="140" rx="10" fill="#cffafe"/>
  <text x="195" y="176" font-family="Arial, sans-serif" font-size="16" fill="#155e75" text-anchor="middle">Foto hero</text>
  <rect x="340" y="104" width="230" height="22" rx="6" fill="#0e7490"/>
  <rect x="340" y="140" width="200" height="12" rx="6" fill="#a5f3fc"/>
  <rect x="340" y="162" width="180" height="12" rx="6" fill="#a5f3fc"/>
  <rect x="340" y="198" width="120" height="36" rx="18" fill="#10b981"/>
  <text x="400" y="221" font-family="Arial, sans-serif" font-size="13" fill="#ffffff" text-anchor="middle">Comprar</text>
  <g fill="#f0fdfa" stroke="#99f6e4">
    <rect x="70" y="262" width="150" height="100" rx="10"/><rect x="245" y="262" width="150" height="100" rx="10"/><rect x="420" y="262" width="150" height="100" rx="10"/>
  </g>
  <text x="320" y="410" font-family="Arial, sans-serif" font-size="12" fill="#0e7490" text-anchor="middle">Proyecto Faro · wireframe home v2</text>
</svg>`;

/** Nota de voz de ejemplo: tonos suaves con envolvente (WAV PCM 16 bits, mono, 8 kHz). */
export function voiceNoteWav(seconds = 4): { data: Uint8Array<ArrayBuffer>; durationMs: number } {
  const rate = 8000;
  const samples = Math.floor(rate * seconds);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples * 2, true);
  const notes = [392, 440, 494, 523, 494, 440];
  const segment = seconds / notes.length;
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const index = Math.min(notes.length - 1, Math.floor(t / segment));
    const note = notes[index];
    const local = (t - index * segment) / segment;
    const envelope = Math.sin(Math.PI * local) * 0.35;
    const value = Math.sin(2 * Math.PI * note * t) * envelope;
    view.setInt16(44 + i * 2, Math.round(value * 32767), true);
  }
  return { data: new Uint8Array(buffer), durationMs: seconds * 1000 };
}
