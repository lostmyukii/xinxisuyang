import { parse } from "csv-parse/sync";
import type { RawTable } from "./types.js";

function normalizeHeaders(values: readonly string[]): string[] {
  const headers = values.map((value, index) => value.trim() || `未命名列${index + 1}`);
  if (new Set(headers).size !== headers.length) throw new Error("IMPORT_DUPLICATE_HEADERS");
  return headers;
}

export function parseDelimited(text: string, delimiter: "," | "\t"): RawTable {
  if (Buffer.byteLength(text, "utf8") > 10 * 1024 * 1024) throw new Error("IMPORT_TOO_LARGE");
  const matrix = parse(text, {
    bom: true,
    delimiter,
    relaxColumnCount: true,
    skipEmptyLines: true,
    trim: false,
  });
  const first = matrix[0];
  if (first === undefined || first.length === 0) throw new Error("IMPORT_EMPTY");
  const headers = normalizeHeaders(first.map(String));
  const rows = matrix.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()])),
  );
  return { headers, rows };
}

export function parseClipboard(text: string): RawTable {
  return parseDelimited(text, "\t");
}

export function parseCsv(text: string): RawTable {
  return parseDelimited(text, ",");
}
