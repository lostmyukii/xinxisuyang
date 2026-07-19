import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { apiOrNull } from "../../api/client.js";
import type { RankingRow, SnapshotSummary } from "../../api/types.js";
import { EmptyState } from "../../components/EmptyState.js";
import { PageHeader } from "../../components/PageHeader.js";
import { RankingTable } from "../../components/RankingTable.js";

export function RankingsPage() {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotSummary | null>(null);
  const [region, setRegion] = useState("");
  const [event, setEvent] = useState("");
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("zh-CN"));

  useEffect(() => {
    void apiOrNull<{ snapshot: SnapshotSummary; rows: RankingRow[] }>("/api/rankings").then((value) => {
      setRows(value?.rows ?? []);
      setSnapshot(value?.snapshot ?? null);
    });
  }, []);

  const options = useMemo(() => ({
    regions: Array.from(new Set(rows.map((row) => row.region))).sort(),
    events: Array.from(new Set(rows.map((row) => row.event))).sort(),
    groups: Array.from(new Set(rows.map((row) => row.group))).sort(),
  }), [rows]);
  const filtered = useMemo(() => rows.filter((row) =>
    (region.length === 0 || row.region === region) &&
    (event.length === 0 || row.event === event) &&
    (group.length === 0 || row.group === group) &&
    (deferredSearch.length === 0 || row.participantName.toLocaleLowerCase("zh-CN").includes(deferredSearch)),
  ), [deferredSearch, event, group, region, rows]);

  return (
    <>
      <PageHeader eyebrow="成绩核对" title="成绩排名" description="固定按赛区、赛项、组别分区；同分采用 1、2、2、4。" />
      {snapshot === null ? <EmptyState title="尚无排名快照" detail="先配置赛项规则并完成一次手动导入。" action={{ href: "/import", label: "前往手动导入" }} /> : (
        <section className="panel">
          <div className="filter-bar">
            <label>赛区<select value={region} onChange={(event) => setRegion(event.target.value)}><option value="">全部赛区</option>{options.regions.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>赛项<select value={event} onChange={(change) => setEvent(change.target.value)}><option value="">全部赛项</option>{options.events.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>组别<select value={group} onChange={(change) => setGroup(change.target.value)}><option value="">全部组别</option>{options.groups.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="search-field">姓名搜索<input type="search" value={search} onChange={(change) => setSearch(change.target.value)} placeholder="输入选手姓名" /></label>
          </div>
          <div className="result-caption"><span>{filtered.length} 条有效成绩</span><span className="data-type">快照 {snapshot.id.slice(0, 8)}</span></div>
          <RankingTable rows={filtered} />
        </section>
      )}
    </>
  );
}
