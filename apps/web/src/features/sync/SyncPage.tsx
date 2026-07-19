import { useEffect, useState } from "react";
import { StatusBadge } from "@xinxisuyang/ui";
import { api, describeError } from "../../api/client.js";
import type { FreshnessSettings, StatusResponse, SyncRun } from "../../api/types.js";
import { PageHeader } from "../../components/PageHeader.js";

const runState = {
  running: { label: "进行中", tone: "orange" as const, icon: "…" },
  succeeded: { label: "成功", tone: "green" as const, icon: "✓" },
  failed: { label: "失败", tone: "red" as const, icon: "×" },
};

export function SyncPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [settings, setSettings] = useState<FreshnessSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const [statusResponse, settingsResponse, runsResponse] = await Promise.all([
      api<StatusResponse>("/api/status"),
      api<FreshnessSettings>("/api/settings/freshness"),
      api<{ runs: SyncRun[] }>("/api/sync-runs?limit=50"),
    ]);
    setStatus(statusResponse);
    setSettings(settingsResponse);
    setRuns(runsResponse.runs);
  };

  useEffect(() => {
    void load().catch((error) => setMessage(describeError(error, "无法读取同步状态")));
  }, []);

  const save = async () => {
    if (settings === null) return;
    setMessage("正在保存新鲜度阈值…");
    try {
      const saved = await api<FreshnessSettings>("/api/settings/freshness", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(saved);
      setMessage("新鲜度阈值已保存到本机数据库。");
      await load();
    } catch (error) {
      setMessage(describeError(error, "无法保存新鲜度阈值"));
    }
  };

  return (
    <>
      <PageHeader eyebrow="运行边界与审计" title="同步管理" description="当前只允许手动导入；每次发布尝试都会留下不含敏感值的本机运行记录。" />
      <div className="sync-layout">
        <section className="panel sync-boundary">
          <StatusBadge tone="orange" icon="!">自动采集未验证</StatusBadge>
          <h2>手动正式版</h2>
          <p>{status?.collectionMessage ?? "正在读取本机状态…"}</p>
          <a className="button button--primary" href="/import">前往手动导入</a>
        </section>
        <section className="panel freshness-settings">
          <h2>数据新鲜度阈值</h2>
          <p>最后一次成功校验超过阈值后，后台和大屏会显示过期警告。</p>
          <div className="settings-fields">
            <label>可能过期（秒）<input type="number" min="30" value={settings?.staleAfterSeconds ?? ""} onChange={(change) => setSettings((current) => current === null ? null : { ...current, staleAfterSeconds: Number(change.target.value) })} /></label>
            <label>严重过期（秒）<input type="number" min="60" value={settings?.criticalAfterSeconds ?? ""} onChange={(change) => setSettings((current) => current === null ? null : { ...current, criticalAfterSeconds: Number(change.target.value) })} /></label>
          </div>
          <button className="button button--quiet" type="button" disabled={settings === null} onClick={() => void save()}>保存新鲜度设置</button>
        </section>
      </div>
      <section className="panel sync-runs">
        <div className="panel-heading"><div><p className="eyebrow">本机审计</p><h2>最近发布尝试</h2></div><span>{runs.length} 条</span></div>
        {runs.length === 0 ? <p className="sync-empty">尚无发布尝试。完成一次手动导入后将在这里记录。</p> : (
          <div className="table-scroll"><table className="ranking-table"><thead><tr><th>状态</th><th>开始时间</th><th>完成时间</th><th>来源</th><th>记录数</th><th>错误原因</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td><StatusBadge tone={runState[run.state].tone} icon={runState[run.state].icon}>{runState[run.state].label}</StatusBadge></td><td className="data-type">{new Date(run.startedAt).toLocaleString("zh-CN", { hour12: false })}</td><td className="data-type">{run.finishedAt === null ? "—" : new Date(run.finishedAt).toLocaleString("zh-CN", { hour12: false })}</td><td>{run.source === "manual" ? "手动导入" : run.source}</td><td className="data-type">{run.recordCount ?? "—"}</td><td>{run.errorCode === null ? "—" : describeError(new Error(run.errorCode), "发布未完成，请在手动导入页检查候选数据。")}</td></tr>)}</tbody></table></div>
        )}
      </section>
      {message === null ? null : <p className="form-message" role="status">{message}</p>}
    </>
  );
}
