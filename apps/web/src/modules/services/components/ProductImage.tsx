import { Package } from 'lucide-react';
import { productImage } from '../utils/product-images';

interface ProductImageProps {
  name: string;
  category?: string | null;
  /** La foto que mande la tienda tiene prioridad sobre la ilustración. */
  imageUrl?: string | null;
  className?: string;
}

/** La foto del producto si la tienda la tiene; si no, su ilustración según el nombre (o una caja). */
export function ProductImage({ name, category, imageUrl, className = 'size-10' }: ProductImageProps) {
  // Foto de la tienda: ocupa todo el recuadro (posición absoluta, así no estira la tarjeta).
  if (imageUrl) return <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-200 group-hover:scale-105" loading="lazy" />;
  const src = productImage(name, category);
  if (!src) return <Package className={className} aria-hidden="true" />;
  return <img src={src} alt="" className={`${className} object-contain drop-shadow-[0_6px_8px_rgba(15,23,42,0.18)]`} loading="lazy" draggable={false} />;
}
