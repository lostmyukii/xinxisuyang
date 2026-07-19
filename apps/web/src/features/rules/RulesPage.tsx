import { useEffect, useState } from "react";
import { api, describeError } from "../../api/client.js";
import type { EventRule, SnapshotSummary } from "../../api/types.js";
import { PageHeader } from "../../components/PageHeader.js";

export function RulesPage() {
  const [rules, setRules] = useState<EventRule[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void api<{ rules: EventRule[] }>("/api/event-rules")
      .then((response) => setRules(response.rules))
      .catch((error) => setMessage(describeError(error, "无法读取赛项规则，请确认本机服务仍在运行。")));
  }, []);

  const update = (index: number, patch: Partial<EventRule>) => {
    setRules((current) => current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule));
  };
  const save = async () => {
    setMessage("正在保存…");
    try {
      const response = await api<{ rules: EventRule[]; snapshot: SnapshotSummary | null }>("/api/event-rules", {
        method: "PUT",
        body: JSON.stringify({ rules }),
      });
      setRules(response.rules);
      setMessage(response.snapshot === null
        ? "赛项规则已保存，首次导入将按新范围排名。"
        : "赛项规则已保存，当前成功快照已按新范围原子重算。",
      );
    } catch (error) {
      setMessage(describeError(error, "无法保存赛项规则，请检查输入后重试。"));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="无默认范围"
        title="赛项配置"
        description="每个赛项必须明确设置最低分和最高分，成绩最多允许两位小数。"
        actions={<button className="button button--primary" type="button" onClick={() => void save()}>保存赛项规则</button>}
      />
      <section className="panel rules-panel">
        <div className="rules-heading"><span>赛项名称</span><span>最低分</span><span>最高分</span><span>启用排名</span><span /></div>
        {rules.map((rule, index) => (
          <div className="rule-row" key={`${rule.event}-${index}`}>
            <label><span>赛项名称</span><input aria-label={`第 ${index + 1} 个赛项名称`} value={rule.event} onChange={(change) => update(index, { event: change.target.value })} placeholder="例如：智能创作" /></label>
            <label><span>最低分</span><input aria-label={`${rule.event || `第 ${index + 1} 个赛项`}最低分`} className="data-type" inputMode="decimal" value={rule.minScore} onChange={(change) => update(index, { minScore: change.target.value })} /></label>
            <label><span>最高分</span><input aria-label={`${rule.event || `第 ${index + 1} 个赛项`}最高分`} className="data-type" inputMode="decimal" value={rule.maxScore} onChange={(change) => update(index, { maxScore: change.target.value })} /></label>
            <label className="switch-label"><span>启用排名</span><input aria-label={`${rule.event || `第 ${index + 1} 个赛项`}启用排名`} type="checkbox" checked={rule.enabled} onChange={(change) => update(index, { enabled: change.target.checked })} /></label>
            <button className="icon-button" type="button" aria-label={`删除赛项 ${rule.event || index + 1}`} onClick={() => setRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index))}>×</button>
          </div>
        ))}
        <button className="button button--quiet add-rule" type="button" onClick={() => setRules((current) => [...current, { event: "", minScore: "", maxScore: "", enabled: true }])}>＋ 添加赛项</button>
      </section>
      {message === null ? null : <p className="form-message" role="status">{message}</p>}
    </>
  );
}
