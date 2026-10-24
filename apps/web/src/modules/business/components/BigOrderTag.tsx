/** Etiqueta roja «GRANDE»: un pedido que la tienda debe confirmar con el cliente antes de prepararlo. */
export function BigOrderTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-white" data-testid="big-order-tag">
      GRANDE
    </span>
  );
}
