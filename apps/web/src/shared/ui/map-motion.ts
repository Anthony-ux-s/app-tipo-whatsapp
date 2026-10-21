import type L from 'leaflet';

const gliding = new WeakMap<L.Marker, number>();

/**
 * Mueve un pin con suavidad hasta su nueva posición (la ubicación llega cada ~3 s): el repartidor
 * avanza por el mapa en vez de saltar de un punto a otro.
 */
export function glide(marker: L.Marker, to: L.LatLngExpression & { lat: number; lng: number }, ms = 2_800): void {
  const from = marker.getLatLng();
  const previous = gliding.get(marker);
  if (previous) cancelAnimationFrame(previous);
  // Saltos grandes (otra ubicación, o la primera) van directo.
  if (Math.abs(from.lat - to.lat) > 0.02 || Math.abs(from.lng - to.lng) > 0.02 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    marker.setLatLng(to);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    marker.setLatLng([from.lat + (to.lat - from.lat) * t, from.lng + (to.lng - from.lng) * t]);
    if (t < 1) gliding.set(marker, requestAnimationFrame(step));
    else gliding.delete(marker);
  };
  gliding.set(marker, requestAnimationFrame(step));
}
