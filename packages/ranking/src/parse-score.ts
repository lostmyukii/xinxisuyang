import { Decimal } from "decimal.js";
import type { IssueCode } from "@xinxisuyang/domain";

const numericPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u;

export type ScoreParseResult =
  | { ok: true; decimal: Decimal; normalized: string }
  | { ok: false; code: Extract<IssueCode, "SCORE_REQUIRED" | "SCORE_NOT_NUMERIC" | "SCORE_PRECISION_EXCEEDED"> };

export function parseScore(scoreRaw: string): ScoreParseResult {
  const value = scoreRaw.trim();
  if (value.length === 0) return { ok: false, code: "SCORE_REQUIRED" };
  if (!numericPattern.test(value)) return { ok: false, code: "SCORE_NOT_NUMERIC" };

  const fraction = value.split(".")[1] ?? "";
  if (fraction.length > 2) return { ok: false, code: "SCORE_PRECISION_EXCEEDED" };

  try {
    const decimal = new Decimal(value);
    return { ok: true, decimal, normalized: decimal.toFixed(fraction.length) };
  } catch {
    return { ok: false, code: "SCORE_NOT_NUMERIC" };
  }
}
