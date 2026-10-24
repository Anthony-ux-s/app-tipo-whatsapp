import { CheckCircle2, Download, FileSpreadsheet, TriangleAlert } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@shared/ui/Button';
import { Modal } from '@shared/ui/Modal';
import { formatSoles } from '@shared/utils/money';
import { useCatalogImport } from '../hooks/use-catalog-import.hook';

/** Cuántas filas se muestran en la vista previa (el archivo completo se envía igual). */
const PREVIEW_ROWS = 8;

interface CatalogImportModalProps {
  open: boolean;
  onClose: () => void;
  /** Para volver a leer el catálogo cuando termina el envío. */
  onFinished: () => void;
}

/** Importar productos desde un archivo CSV: elegir, revisar errores fila por fila y enviar. */
export function CatalogImportModal({ open, onClose, onFinished }: CatalogImportModalProps) {
  const imp = useCatalogImport(onFinished);
  const input = useRef<HTMLInputElement>(null);

  const close = () => {
    if (imp.sending) return;
    imp.reset();
    onClose();
  };

  const rowsWithErrors = imp.parsed?.rows.filter((r) => r.errors.length) ?? [];
  const previewOk = imp.parsed?.rows.filter((r) => r.product).slice(0, PREVIEW_ROWS) ?? [];

  return (
    <Modal
      open={open}
      onClose={close}
      title="Importar productos"
      description="Sube un archivo CSV (puedes guardarlo desde Excel) con tus productos."
      footer={
        imp.summary ? (
          <Button onClick={close}>Listo</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={imp.sending}>Cancelar</Button>
            <Button onClick={() => void imp.send()} loading={imp.sending} disabled={imp.validCount === 0} data-testid="import-send">
              {imp.sending ? `Enviando ${imp.progress.done} de ${imp.progress.total}…` : `Importar ${imp.validCount} ${imp.validCount === 1 ? 'producto' : 'productos'}`}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {imp.summary ? (
          <div className="flex flex-col gap-3" data-testid="import-summary">
            <p className="flex items-center gap-2 text-base font-bold text-ink">
              <CheckCircle2 className="size-5 text-emerald-600" /> {imp.summary.aborted ? 'Importación incompleta' : 'Importación terminada'}
            </p>
            <ul className="text-sm text-ink-soft">
              <li>
                <b className="text-ink">{imp.summary.created}</b> productos nuevos
              </li>
              <li>
                <b className="text-ink">{imp.summary.updated}</b> productos actualizados
              </li>
              <li>
                <b className="text-ink">{imp.summary.errors.length + imp.errorCount}</b> filas con problemas
              </li>
            </ul>
            {imp.summary.aborted && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-400">Se cortó el envío: {imp.summary.aborted} Puedes volver a subir el archivo; los productos ya enviados solo se actualizan.</p>}
            {imp.summary.errors.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-xl bg-surface-3 p-3 text-xs text-ink-soft">
                {imp.summary.errors.map((e) => (
                  <li key={`${e.row}-${e.sku}`}>
                    Fila {e.row} ({e.sku || 'sin código'}): {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 rounded-xl bg-surface-3 p-3 text-sm text-ink-soft">
              <p>
                La primera fila lleva los nombres de las columnas: <b className="text-ink">sku, nombre, precio</b> y <b className="text-ink">stock</b> son obligatorias. Opcionales: presentacion, precio_antes, categoria, imagen y activo.
              </p>
              <p>Los precios van en soles (ej. 4.50). Si un código ya existe, se actualiza.</p>
              <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={imp.downloadTemplate} className="self-start" data-testid="download-template">
                Descargar plantilla CSV
              </Button>
            </div>

            <div>
              <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="sr-only" aria-label="Archivo CSV de productos" onChange={(e) => void imp.readFile(e.target.files?.[0])} data-testid="import-file" />
              <Button variant="secondary" icon={<FileSpreadsheet className="size-4" />} onClick={() => input.current?.click()} disabled={imp.sending}>
                {imp.fileName ? 'Elegir otro archivo' : 'Elegir archivo'}
              </Button>
              {imp.fileName && <span className="ml-3 text-sm text-ink-soft">{imp.fileName}</span>}
            </div>

            {imp.fileError && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-400">{imp.fileError}</p>}

            {imp.parsed && (
              <div className="flex flex-col gap-3" data-testid="import-preview">
                <p className="text-sm text-ink">
                  <b>{imp.validCount}</b> {imp.validCount === 1 ? 'fila lista' : 'filas listas'} para importar
                  {imp.errorCount > 0 && (
                    <>
                      {' · '}
                      <b className="text-rose-700 dark:text-rose-400">{imp.errorCount}</b> con errores (no se enviarán)
                    </>
                  )}
                </p>
                {imp.parsed.ignored.length > 0 && <p className="text-xs text-ink-faint">Columnas que no usamos: {imp.parsed.ignored.join(', ')}.</p>}

                {previewOk.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full min-w-[28rem] text-left text-xs">
                      <thead className="bg-surface-3 text-ink-soft">
                        <tr>
                          <th className="px-3 py-2">Fila</th>
                          <th className="px-3 py-2">Código</th>
                          <th className="px-3 py-2">Nombre</th>
                          <th className="px-3 py-2">Precio</th>
                          <th className="px-3 py-2">Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line text-ink">
                        {previewOk.map((r) => (
                          <tr key={r.row}>
                            <td className="px-3 py-1.5">{r.row}</td>
                            <td className="px-3 py-1.5">{r.product!.sku}</td>
                            <td className="px-3 py-1.5">{r.product!.name}</td>
                            <td className="px-3 py-1.5">{formatSoles(r.product!.priceCents)}</td>
                            <td className="px-3 py-1.5">{r.product!.stock}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {rowsWithErrors.length > 0 && (
                  <div className="rounded-xl bg-rose-50 p-3 text-xs text-ink dark:bg-rose-950/40 dark:text-ink" data-testid="import-errors">
                    <p className="mb-1 flex items-center gap-1.5 font-bold">
                      <TriangleAlert className="size-4" /> Corrige estas filas en tu archivo y vuelve a subirlo (o importa solo las listas)
                    </p>
                    <ul className="max-h-40 overflow-y-auto">
                      {rowsWithErrors.map((r) => (
                        <li key={r.row}>
                          Fila {r.row}: {r.errors.join(' ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
