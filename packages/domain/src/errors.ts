export const issueCodes = [
  "FIELD_MISSING",
  "RECORD_INCOMPLETE",
  "DUPLICATE_SOURCE_ID",
  "SCORE_REQUIRED",
  "SCORE_NOT_NUMERIC",
  "SCORE_PRECISION_EXCEEDED",
  "SCORE_OUT_OF_RANGE",
  "EVENT_RULE_MISSING",
  "EVENT_RULE_DISABLED",
] as const;

export type IssueCode = (typeof issueCodes)[number];

export const issueMessages: Readonly<Record<IssueCode, string>> = {
  FIELD_MISSING: "导入数据缺少必需字段",
  RECORD_INCOMPLETE: "记录的赛区、赛项、组别或姓名不完整",
  DUPLICATE_SOURCE_ID: "来源记录标识重复",
  SCORE_REQUIRED: "成绩为空",
  SCORE_NOT_NUMERIC: "成绩不是有效数字",
  SCORE_PRECISION_EXCEEDED: "成绩超过两位小数",
  SCORE_OUT_OF_RANGE: "成绩超出该赛项允许范围",
  EVENT_RULE_MISSING: "该赛项尚未配置最低分和最高分",
  EVENT_RULE_DISABLED: "该赛项当前未启用排名",
};
