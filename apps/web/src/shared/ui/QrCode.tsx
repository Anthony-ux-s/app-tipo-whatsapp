import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

interface QrCodeProps {
  value: string;
  /** Texto para lectores de pantalla. */
  label: string;
  className?: string;
}

/** Código QR dibujado como SVG con React (sin HTML inyectado). Nivel M: tolera manchas leves. */
export function QrCode({ value, label, className = '' }: QrCodeProps) {
  const { path, size } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) d += `M${col + 4},${row + 4}h1v1h-1z`;
      }
    }
    return { path: d, size: count + 8 };
  }, [value]);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className={className} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#0b1f1d" />
    </svg>
  );
}
