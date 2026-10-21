import type { GeoPoint } from '@parla/types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { DEFAULT_CENTER } from '@shared/utils/geo';
import { vehicleGlyph } from '@shared/utils/vehicle';
import { glide } from './map-motion';

export interface DeliveryMapProps {
  store?: GeoPoint | null;
  destination?: GeoPoint | null;
  driver?: GeoPoint | null;
  /** Vehículo del repartidor: su ícono en el mapa (🛵, 🚗, 🚲 o 🚶). */
  vehicle?: string | null;
  /** Recorrido por las calles (si se conoce); si no, se unen los puntos en línea recta. */
  route?: GeoPoint[] | null;
  /** Modo selector: tocar el mapa (o arrastrar el pin) marca el destino. */
  onPick?: (point: GeoPoint) => void;
  className?: string;
  label: string;
}

/** Pines dibujados con CSS (sin imágenes externas): tienda, casa del cliente y repartidor. */
function pin(kind: 'store' | 'destination' | 'driver', vehicle?: string | null): L.DivIcon {
  const styles = {
    store: 'background:#f59e0b',
    destination: 'background:#009d71',
    driver: 'background:#0891b2;box-shadow:0 0 0 6px rgba(8,145,178,.25)',
  }[kind];
  const glyph = { store: '🏪', destination: '🏠', driver: vehicleGlyph(vehicle) }[kind];
  return L.divIcon({
    className: '',
    html: `<span style="${styles};display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:9999px;border:3px solid #fff;font-size:16px">${glyph}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

/**
 * Mapa del delivery con OpenStreetMap (sin clave): la tienda, el destino y el repartidor en vivo.
 * Se encuadra solo con los puntos que haya; en modo selector, el cliente marca dónde le entregan.
 */
export function DeliveryMap({ store, destination, driver, vehicle, route: path, onPick, className = '', label }: DeliveryMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<Partial<Record<'store' | 'destination' | 'driver', L.Marker>>>({});
  const route = useRef<L.Polyline | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  /** Con qué puntos se encuadró el mapa: se vuelve a encuadrar solo si cambian la tienda o el destino. */
  const framed = useRef('');

  useEffect(() => {
    if (!host.current) return;
    // Sin animaciones: si se cambia de pantalla en medio de un zoom, Leaflet falla al desmontarse.
    const m = L.map(host.current, { zoomControl: true, attributionControl: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView(
      [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      14,
    );
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => pickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      markers.current = {};
      route.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const points = { store, destination, driver };
    for (const kind of ['store', 'destination', 'driver'] as const) {
      const p = points[kind];
      const current = markers.current[kind];
      if (!p) {
        current?.remove();
        delete markers.current[kind];
        continue;
      }
      if (current && kind === 'driver') glide(current, p);
      else if (current) current.setLatLng([p.lat, p.lng]);
      else {
        const marker = L.marker([p.lat, p.lng], { icon: pin(kind, vehicle), draggable: kind === 'destination' && !!onPick, keyboard: false });
        if (kind === 'destination') marker.on('dragend', () => pickRef.current?.({ lat: marker.getLatLng().lat, lng: marker.getLatLng().lng }));
        markers.current[kind] = marker.addTo(m);
      }
    }
    // Recorrido por las calles si se conoce; si no, en línea recta: repartidor → tienda → destino.
    const line = (path?.length ? path : [driver, store, destination].filter((p): p is GeoPoint => !!p)).map((p) => L.latLng(p.lat, p.lng));
    route.current?.remove();
    route.current =
      line.length > 1
        ? L.polyline(line, path?.length ? { color: '#009d71', weight: 5, opacity: 0.75 } : { color: '#009d71', weight: 4, opacity: 0.6, dashArray: '6 8' }).addTo(m)
        : null;
    // Encuadre: al principio y cuando cambian la tienda o el destino. Mientras el repartidor avanza,
    // el mapa no salta: solo lo sigue si se sale de la vista.
    const all = [store, destination, driver].filter((p): p is GeoPoint => !!p);
    const frame = [store, destination, !!driver].map((p) => (p && typeof p === 'object' ? `${p.lat},${p.lng}` : String(p))).join('|');
    if (frame !== framed.current) {
      framed.current = frame;
      if (all.length > 1) m.fitBounds(L.latLngBounds(all.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 16, animate: false });
      else if (all.length === 1) m.setView([all[0].lat, all[0].lng], Math.max(m.getZoom(), 15), { animate: false });
    } else if (driver && !m.getBounds().pad(-0.1).contains([driver.lat, driver.lng])) {
      m.panTo([driver.lat, driver.lng], { animate: true });
    }
  }, [store?.lat, store?.lng, destination?.lat, destination?.lng, driver?.lat, driver?.lng, path, onPick]);

  useEffect(() => {
    markers.current.driver?.setIcon(pin('driver', vehicle));
  }, [vehicle]);

  return <div ref={host} role="img" aria-label={label} data-testid="delivery-map" className={`z-0 h-56 w-full overflow-hidden rounded-2xl bg-surface-3 md:h-64 ${className}`} />;
}
