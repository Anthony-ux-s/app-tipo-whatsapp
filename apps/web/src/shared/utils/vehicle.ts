/** Ícono del repartidor en el mapa según su vehículo (por defecto, moto: la mayoría reparte en moto). */
const GLYPHS: Record<string, string> = { Moto: '🛵', Auto: '🚗', Bicicleta: '🚲', 'A pie': '🚶' };

export function vehicleGlyph(vehicle: string | null | undefined): string {
  return (vehicle && GLYPHS[vehicle]) || GLYPHS.Moto;
}
