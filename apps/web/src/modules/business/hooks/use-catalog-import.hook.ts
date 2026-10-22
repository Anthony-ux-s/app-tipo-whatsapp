import type { ImportProductsRequest, ImportProductsResult } from '@parla/types';
import { useState } from 'react';
import { saveFile } from '@shared/utils/download';
import { errorMessage, http } from '@shared/utils/http';
import { CATALOG_CSV_TEMPLATE, chunk, parseCatalogCsv, type ParsedCatalog } from '../utils/catalog-csv.utils';

/** Archivos más grandes que esto no son un catálogo de tienda: se avisa antes de leerlos. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface ImportSummary {
  created: number;
  updated: number;
  /** Errores del servidor, con el número de fila del archivo. */
  errors: { row: number; sku: string; message: string }[];
  /** Si se cortó a la mitad (sin conexión, sesión vencida…), el motivo. */
  aborted: string | null;
}

/** Importar productos desde un CSV: se lee en el navegador, se revisa y se envía en lotes. */
export function useCatalogImport(onFinished: () => void) {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCatalog | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const valid = parsed?.rows.filter((r) => r.product) ?? [];

  const reset = () => {
    setFileName('');
    setParsed(null);
    setFileError(null);
    setSummary(null);
    setProgress({ done: 0, total: 0 });
  };

  return {
    fileName,
    parsed,
    fileError,
    sending,
    progress,
    summary,
    validCount: valid.length,
    errorCount: (parsed?.rows.length ?? 0) - valid.length,
    reset,
    readFile: async (file: File | undefined) => {
      reset();
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) return setFileError('El archivo es muy grande (máximo 5 MB). Divídelo en varios.');
      setFileName(file.name);
      try {
        const result = parseCatalogCsv(await file.text());
        if (result.fileError) setFileError(result.fileError);
        else setParsed(result);
      } catch {
        setFileError('No pudimos leer el archivo. Guárdalo como CSV (separado por comas) e inténtalo de nuevo.');
      }
    },
    downloadTemplate: () => {
      const url = URL.createObjectURL(new Blob([CATALOG_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }));
      saveFile(url, 'plantilla-productos-parla.csv');
      URL.revokeObjectURL(url);
    },
    /** Envía solo las filas sin errores, de a 200, y junta el resultado de cada lote. */
    send: async () => {
      if (!valid.length) return;
      const batches = chunk(valid);
      const total: ImportSummary = { created: 0, updated: 0, errors: [], aborted: null };
      setSending(true);
      setProgress({ done: 0, total: valid.length });
      let offset = 0;
      for (const batch of batches) {
        try {
          const result = await http.post<ImportProductsResult>('/business/products/import', { rows: batch.map((r) => r.product!) } satisfies ImportProductsRequest);
          total.created += result.created;
          total.updated += result.updated;
          // La fila del servidor cuenta dentro del lote: se vuelve al número de fila del archivo.
          for (const e of result.errors) total.errors.push({ ...e, row: batch[e.row - 1]?.row ?? e.row });
        } catch (err) {
          total.aborted = errorMessage(err);
          break;
        }
        offset += batch.length;
        setProgress({ done: offset, total: valid.length });
      }
      setSending(false);
      setSummary(total);
      onFinished();
    },
  };
}
