import { useEffect, useMemo, useState } from "react";
import { SegmentedControl } from "@xinxisuyang/ui";
import { apiBase, apiOrNull } from "../../api/client.js";
import type { RankingRow, SnapshotSummary } from "../../api/types.js";
import { EmptyState } from "../../components/EmptyState.js";
import { PageHeader } from "../../components/PageHeader.js";

type Scope = "group" | "event" | "all";

function filenameFromDisposition(value: string | null): string {
  const match = value?.match(/filename\*=UTF-8''([^;]+)/u);
  return match?.[1] === undefined ? "信息素养大赛_成绩导出" : decodeURIComponent(match[1]);
}

export function ExportPage() {
  const [rows, setRows] = useState<RankingRow[] | null>(null);
  const [scope, setScope] = useState<Scope>("group");
  const [region, setRegion] = useState("");
  const [eventName, setEventName] = useState("");
  const [group, setGroup] = useState("");
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { void apiOrNull<{ snapshot: SnapshotSummary; rows: RankingRow[] }>("/api/rankings").then((value) => setRows(value?.rows ?? [])); }, []);
  const options = useMemo(() => ({
    regions: Array.from(new Set((rows ?? []).map((row) => row.region))).sort(),
    events: Array.from(new Set((rows ?? []).map((row) => row.event))).sort(),
    groups: Array.from(new Set((rows ?? []).filter((row) => (region === "" || row.region === region) && (eventName === "" || row.event === eventName)).map((row) => row.group))).sort(),
  }), [eventName, region, rows]);

  const download = async () => {
    setMessage("正在生成可追溯导出文件…");
    try {
      const response = await fetch(`${apiBase}/api/exports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          ...(scope === "group" ? { region, event: eventName, group } : {}),
          ...(scope === "event" ? { event: eventName } : {}),
          includeSensitive,
          ...(includeSensitive && confirmed ? { confirmation: "INCLUDE_SENSITIVE_FIELDS" } : {}),
        }),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFromDisposition(response.headers.get("content-disposition"));
      link.click();
      URL.revokeObjectURL(url);
      setMessage("导出文件已生成，内容对应当前成功快照。");
    } catch (error) {
      setMessage(`导出失败：${error instanceof Error ? error.message : "UNKNOWN"}`);
    }
  };
  const disabled = rows === null || rows.length === 0 || (scope === "group" && (!region || !eventName || !group)) || (scope === "event" && !eventName) || (includeSensitive && !confirmed);

  return (
    <>
      <PageHeader eyebrow="文件可追溯" title="导出中心" description="按当前分组、当前赛项或全部赛项生成 Excel；敏感字段默认关闭。" />
      {rows !== null && rows.length === 0 ? <EmptyState title="尚无可导出的排名" detail="完成一次成功导入后再生成文件。" /> : (
        <section className="panel export-panel">
          <h2>选择导出范围</h2>
          <SegmentedControl<Scope> ariaLabel="导出范围" value={scope} onChange={setScope} segments={[{ label: "当前分组", value: "group" }, { label: "当前赛项", value: "event" }, { label: "全部赛项", value: "all" }]} />
          {scope === "all" ? <div className="scope-summary">将为每个赛项生成一个工作簿，并打包为 ZIP。</div> : (
            <div className="export-filters">
              {scope === "group" ? <label>赛区<select value={region} onChange={(change) => setRegion(change.target.value)}><option value="">请选择</option>{options.regions.map((value) => <option key={value}>{value}</option>)}</select></label> : null}
              <label>赛项<select value={eventName} onChange={(change) => setEventName(change.target.value)}><option value="">请选择</option>{options.events.map((value) => <option key={value}>{value}</option>)}</select></label>
              {scope === "group" ? <label>组别<select value={group} onChange={(change) => setGroup(change.target.value)}><option value="">请选择</option>{options.groups.map((value) => <option key={value}>{value}</option>)}</select></label> : null}
            </div>
          )}
          <div className="sensitive-box">
            <label><input type="checkbox" checked={includeSensitive} onChange={(change) => { setIncludeSensitive(change.target.checked); setConfirmed(false); }} /> 包含手机号和身份证号</label>
            <p>通常不需要敏感字段。包含后文件名和本机审计记录会标记该操作。</p>
            {includeSensitive ? <label className="confirm-sensitive"><input type="checkbox" checked={confirmed} onChange={(change) => setConfirmed(change.target.checked)} /> 我确认此文件只用于经授权的成绩核对，并会妥善保管</label> : null}
          </div>
          <button className="button button--primary export-button" type="button" disabled={disabled} onClick={() => void download()}>生成并下载文件</button>
        </section>
      )}
      {message === null ? null : <p className="form-message" role="status">{message}</p>}
    </>
  );
}
