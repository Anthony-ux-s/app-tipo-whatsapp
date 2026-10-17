/** Se mira el contenido, no lo que dice el navegador: solo JPEG de verdad (empieza en FFD8FF y termina en FFD9). */
export function isJpeg(data: Buffer): boolean {
  return data.length > 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9;
}
