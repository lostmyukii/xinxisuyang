import { Decimal } from "decimal.js";
import type { EventRule, IssueCode } from "@xinxisuyang/domain";
import { parseScore } from "./parse-score.js";

export type ScoreValidationResult =
  | { ok: true; decimal: Decimal; normalized: string }
  | { ok: false; code: IssueCode };

export function validateScore(scoreRaw: string, rule: EventRule | undefined): ScoreValidationResult {
  if (rule === undefined) return { ok: false, code: "EVENT_RULE_MISSING" };
  if (!rule.enabled) return { ok: false, code: "EVENT_RULE_DISABLED" };

  const parsed = parseScore(scoreRaw);
  if (!parsed.ok) return parsed;

  const min = new Decimal(rule.minScore);
  const max = new Decimal(rule.maxScore);
  if (parsed.decimal.lessThan(min) || parsed.decimal.greaterThan(max)) {
    return { ok: false, code: "SCORE_OUT_OF_RANGE" };
  }

  return parsed;
}
