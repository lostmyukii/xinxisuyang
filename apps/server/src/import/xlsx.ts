import ExcelJS from "exceljs";
import type { RawTable } from "./types.js";

const { Workbook } = ExcelJS;

export async function parseXlsx(buffer: Buffer): Promise<RawTable> {
  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error("IMPORT_TOO_LARGE");
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  if (workbook.worksheets.length === 0) throw new Error("IMPORT_EMPTY");
  if (workbook.worksheets.length > 20) throw new Error("IMPORT_TOO_MANY_WORKSHEETS");
  const worksheet = workbook.worksheets[0];
  if (worksheet === undefined || worksheet.actualRowCount === 0) throw new Error("IMPORT_EMPTY");

  const headerRow = worksheet.getRow(1);
  const columnCount = Math.max(worksheet.actualColumnCount, headerRow.actualCellCount);
  const headers = Array.from({ length: columnCount }, (_, index) => {
    const text = headerRow.getCell(index + 1).text.trim();
    return text.length > 0 ? text : `未命名列${index + 1}`;
  });
  if (new Set(headers).size !== headers.length) throw new Error("IMPORT_DUPLICATE_HEADERS");

  const rows: Array<Record<string, string>> = [];
  for (let rowIndex = 2; rowIndex <= worksheet.actualRowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const record = Object.fromEntries(
      headers.map((header, index) => [header, row.getCell(index + 1).text.trim()]),
    );
    if (Object.values(record).some((value) => value.length > 0)) rows.push(record);
  }
  return { headers, rows };
}
