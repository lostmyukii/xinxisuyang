import { z } from "zod";
import type { RankingRow } from "./ranking.js";
import { freshnessSchema } from "./sync-state.js";

export const displayRankingRowSchema = z.object({
  region: z.string(),
  event: z.string(),
  group: z.string(),
  participantName: z.string(),
  score: z.string(),
  rank: z.number().int().positive(),
});

export const displaySnapshotSchema = z.object({
  snapshotId: z.string(),
  lastSuccessAt: z.string().datetime(),
  freshness: freshnessSchema,
  rows: z.array(displayRankingRowSchema),
});

export type DisplaySnapshot = z.infer<typeof displaySnapshotSchema>;

export function maskParticipantName(name: string): string {
  const characters = Array.from(name.trim());
  if (characters.length === 0) return "—";
  if (characters.length === 1) return "*";
  if (characters.length === 2) return `${characters[0]}*`;
  return `${characters[0]}${"*".repeat(characters.length - 2)}${characters.at(-1)}`;
}

export function toDisplayRankingRow(row: RankingRow) {
  return displayRankingRowSchema.parse({
    region: row.region,
    event: row.event,
    group: row.group,
    participantName: maskParticipantName(row.participantName),
    score: row.score,
    rank: row.rank,
  });
}
