import type { GeoPoint } from '@parla/types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { DEFAULT_CENTER } from '@shared/utils/geo';
import { vehicleGlyph } from '@shared/utils/vehicle';
import { glide } from './map-motion';

export interface RouteMapStop {
  point: GeoPoint;
  kind: 'pickup' | 'dropoff';
  /** Número de la parada en el recorrido (se muestra en el pin). */
  n?: number;
  title?: string;
}

export interface RouteMapProps {
  /** Dónde está el repartidor (o el punto de partida). */
  start?: GeoPoint | null;
  /** Vehículo del repartidor: su ícono en el punto de partida. */
  vehicle?: string | null;
  stops: RouteMapStop[];
  /** Recorridos a dibujar (por las calles si se conocen; si no, se unen las paradas en orden). */
  paths?: GeoPoint[][];
  /** Tocar el mapa elige un punto (simulador de tarifas). */
  onPick?: (point: GeoPoint) => void;
  className?: string;
  label: string;
}

function stopIcon(group: RouteMapStop[]): L.DivIcon {
  const first = group[0];
  const bg = first.kind === 'pickup' ? '#d97706' : '#009d71';
  const numbers = group.map((s) => s.n).filter((n): n is number => n !== undefined);
  const text = numbers.length > 1 ? `${numbers[0]}–${numbers[numbers.length - 1]}` : numbers.length ? String(numbers[0]) : first.kind === 'pickup' ? '🏪' : '🏠';
  const width = text.length > 2 ? 44 : 30;
  return L.divIcon({
    className: '',
    html: `<span style="background:${bg};display:flex;width:${width}px;height:30px;align-items:center;justify-content:center;border-radius:9999px;border:3px solid #fff;color:#fff;font:700 13px/1 Inter,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.3)">${text}</span>`,
    iconSize: [width, 30],
    iconAnchor: [width / 2, 15],
  });
}

/** Paradas en el mismo lugar y del mismo tipo (p. ej. tres recojos en la misma tienda) van en un solo pin. */
function groupStops(stops: RouteMapStop[]): RouteMapStop[][] {
  const groups = new Map<string, RouteMapStop[]>();
  for (const s of stops) {
    const key = `${s.kind}:${s.point.lat.toFixed(4)},${s.point.lng.toFixed(4)}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()];
}

function startIcon(vehicle?: string | null): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span style="background:#0891b2;display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:9999px;border:3px solid #fff;font-size:17px;box-shadow:0 0 0 6px rgba(8,145,178,.25)">${vehicleGlyph(vehicle)}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

/**
 * Mapa de un recorrido con varias paradas numeradas (OpenStreetMap): recojos en ámbar, entregas en
 * verde y el repartidor en celeste. Se encuadra solo con todo lo que muestra.
 */
export function RouteMap({ start, vehicle, stops, paths, onPick, className = '', label }: RouteMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const startMarker = useRef<L.Marker | null>(null);
  /** Paradas con las que se encuadró: mientras el repartidor avanza, el mapa no salta. */
  const framed = useRef('');
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!host.current) return;
    const m = L.map(host.current, { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => pickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
      startMarker.current = null;
      framed.current = '';
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const lines = paths?.length ? paths : [stops.map((s) => s.point)];
    for (const line of lines) {
      if (line.length < 2) continue;
      L.polyline(
        line.map((p) => L.latLng(p.lat, p.lng)),
        paths?.length ? { color: '#009d71', weight: 5, opacity: 0.75 } : { color: '#009d71', weight: 4, opacity: 0.65, dashArray: '6 8' },
      ).addTo(g);
    }
    for (const group of groupStops(stops)) {
      const marker = L.marker([group[0].point.lat, group[0].point.lng], { icon: stopIcon(group), keyboard: false });
      const titles = [...new Set(group.map((s) => s.title).filter(Boolean))];
      if (titles.length) marker.bindTooltip(group.length > 1 ? `${titles.join(' · ')} (${group.length} paradas)` : titles[0]!);
      marker.addTo(g);
    }
    const frame = stops.map((s) => `${s.kind}:${s.point.lat},${s.point.lng}`).join('|') + (start ? '|start' : '');
    if (frame !== framed.current) {
      framed.current = frame;
      const all = [...(start ? [start] : []), ...stops.map((s) => s.point), ...(paths ?? []).flat()];
      if (all.length > 1) m.fitBounds(L.latLngBounds(all.map((p) => [p.lat, p.lng])), { padding: [36, 36], maxZoom: 16, animate: false });
      else if (all.length === 1) m.setView([all[0].lat, all[0].lng], 15, { animate: false });
    }
  }, [!!start, stops, paths]);

  // El repartidor va aparte: se desliza hasta cada ubicación nueva en vez de redibujarse.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!start) {
      startMarker.current?.remove();
      startMarker.current = null;
      return;
    }
    if (startMarker.current) glide(startMarker.current, start);
    else startMarker.current = L.marker([start.lat, start.lng], { icon: startIcon(vehicle), keyboard: false, zIndexOffset: 1000 }).bindTooltip('Tú').addTo(m);
  }, [start?.lat, start?.lng]);

  useEffect(() => {
    startMarker.current?.setIcon(startIcon(vehicle));
  }, [vehicle]);

  return <div ref={host} role="img" aria-label={label} data-testid="route-map" className={`z-0 h-64 w-full overflow-hidden rounded-2xl bg-surface-3 md:h-80 ${className}`} />;
}
