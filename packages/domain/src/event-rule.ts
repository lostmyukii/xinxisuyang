import { z } from "zod";

const decimalTextSchema = z
  .string()
  .trim()
  .regex(/^[+-]?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/u, "必须是最多两位小数的数字");

export const eventRuleSchema = z
  .object({
    event: z.string().trim().min(1),
    minScore: decimalTextSchema,
    maxScore: decimalTextSchema,
    enabled: z.boolean().default(true),
  })
  .superRefine((rule, context) => {
    const normalize = (value: string): bigint => {
      const [integer = "0", fraction = ""] = value.replace(/^\+/u, "").split(".");
      const sign = integer.startsWith("-") ? -1n : 1n;
      const absoluteInteger = integer.replace("-", "");
      return sign * BigInt(`${absoluteInteger || "0"}${fraction.padEnd(2, "0")}`);
    };

    if (normalize(rule.minScore) > normalize(rule.maxScore)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxScore"],
        message: "最高分必须大于或等于最低分",
      });
    }
  });

export type EventRule = z.infer<typeof eventRuleSchema>;
