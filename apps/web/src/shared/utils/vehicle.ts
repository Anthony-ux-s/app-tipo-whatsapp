/** Ícono del repartidor en el mapa según su vehículo (por defecto, moto: la mayoría reparte en moto). */
const GLYPHS: Record<string, string> = { Moto: '🛵', Auto: '🚗', Bicicleta: '🚲', 'A pie': '🚶' };

export function vehicleGlyph(vehicle: string | null | undefined): string {
  // En el pedido viene con la placa («Auto · ABC-123»): cuenta el tipo, antes del «·».
  const kind = vehicle?.split('·')[0].trim();
  return (kind && GLYPHS[kind]) || GLYPHS.Moto;
}
