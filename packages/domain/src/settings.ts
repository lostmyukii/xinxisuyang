import { z } from "zod";

export const freshnessSettingsSchema = z
  .object({
    staleAfterSeconds: z.number().int().min(30).max(24 * 60 * 60),
    criticalAfterSeconds: z.number().int().min(60).max(7 * 24 * 60 * 60),
  })
  .superRefine((settings, context) => {
    if (settings.criticalAfterSeconds <= settings.staleAfterSeconds) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["criticalAfterSeconds"],
        message: "严重警告阈值必须大于过期阈值",
      });
    }
  });

export type FreshnessSettings = z.infer<typeof freshnessSettingsSchema>;

export const defaultFreshnessSettings: FreshnessSettings = {
  staleAfterSeconds: 120,
  criticalAfterSeconds: 300,
};
