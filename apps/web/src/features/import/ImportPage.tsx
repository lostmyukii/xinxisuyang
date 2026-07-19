import { useMemo, useRef, useState } from "react";
import { SegmentedControl } from "@xinxisuyang/ui";
import { api, describeError } from "../../api/client.js";
import { PageHeader } from "../../components/PageHeader.js";

type ImportFormat = "clipboard" | "csv" | "xlsx";
type MappingKey = "region" | "event" | "group" | "participantName" | "scoreRaw" | "sourceRecordId" | "phone" | "idNumber";

interface Preview {
  headers: string[];
  hash: string;
  recordCount: number;
  validCount: number;
  issueCount: number;
  partitionCount: number;
  missingRuleEvents: string[];
  samples: Array<Record<string, string>>;
  issues: Array<{ sourceIndex: number; message: string }>;
}

const initialMapping: Record<MappingKey, string> = {
  region: "赛区",
  event: "赛项",
  group: "组别",
  participantName: "选手姓名",
  scoreRaw: "成绩",
  sourceRecordId: "",
  phone: "",
  idNumber: "",
};
const labels: Record<MappingKey, string> = {
  region: "赛区字段",
  event: "赛项字段",
  group: "组别字段",
  participantName: "选手姓名字段",
  scoreRaw: "成绩字段",
  sourceRecordId: "来源记录 ID 字段（可选）",
  phone: "手机号字段（可选）",
  idNumber: "身份证号字段（可选）",
};

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 16_384;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export function ImportPage() {
  const [format, setFormat] = useState<ImportFormat>("clipboard");
  const [text, setText] = useState("");
  const [base64, setBase64] = useState("");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState(initialMapping);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileReadVersion = useRef(0);
  const payload = useMemo(() => ({
    format,
    ...(format === "xlsx" ? { base64 } : { text }),
    mapping: {
      region: mapping.region,
      event: mapping.event,
      group: mapping.group,
      participantName: mapping.participantName,
      scoreRaw: mapping.scoreRaw,
      ...(mapping.sourceRecordId.trim().length === 0 ? {} : { sourceRecordId: mapping.sourceRecordId }),
      ...(mapping.phone.trim().length === 0 ? {} : { phone: mapping.phone }),
      ...(mapping.idNumber.trim().length === 0 ? {} : { idNumber: mapping.idNumber }),
    },
  }), [base64, format, mapping, text]);

  const runPreview = async () => {
    setMessage("正在校验候选数据…");
    try {
      const response = await api<Preview>("/api/import/preview", { method: "POST", body: JSON.stringify(payload) });
      setPreview(response);
      setMessage("预览完成。确认数量、赛项配置和异常后再发布。");
    } catch (error) {
      setPreview(null);
      setMessage(describeError(error, "预览失败，请检查源表内容和字段映射。"));
    }
  };
  const publish = async () => {
    if (preview === null) return;
    setMessage("正在原子发布快照…");
    try {
      await api("/api/import/publish", {
        method: "POST",
        body: JSON.stringify({ ...payload, expectedHash: preview.hash }),
      });
      setMessage("快照已发布。排名、大屏和导出已切换到本次成功数据。");
    } catch (error) {
      setMessage(`发布失败，上一成功快照未受影响：${describeError(error, "请检查候选数据后重试。")}`);
    }
  };

  return (
    <>
      <PageHeader eyebrow="候选数据先预览" title="手动导入" description="支持表格复制、CSV 和 XLSX；确认字段映射后才会生成新快照。" />
      <div className="import-layout">
        <section className="panel import-source">
          <h2>1. 选择数据来源</h2>
          <SegmentedControl ariaLabel="导入格式" value={format} onChange={(value) => { setFormat(value); setPreview(null); }} segments={[
            { label: "表格复制", value: "clipboard" },
            { label: "CSV", value: "csv" },
            { label: "XLSX", value: "xlsx" },
          ]} />
          {format === "xlsx" ? (
            <div className="file-drop">
              <input ref={fileInput} className="visually-hidden" type="file" accept=".xlsx" onChange={(change) => {
                const file = change.target.files?.[0];
                if (file === undefined) return;
                const version = fileReadVersion.current + 1;
                fileReadVersion.current = version;
                setFileName(file.name);
                setBase64("");
                setPreview(null);
                setMessage("正在读取 XLSX 文件…");
                void fileToBase64(file).then((encoded) => {
                  if (fileReadVersion.current !== version) return;
                  setBase64(encoded);
                  setMessage("XLSX 已在本机读取，可以生成预览。");
                }).catch(() => {
                  if (fileReadVersion.current !== version) return;
                  setMessage("无法读取该 XLSX 文件，请重新选择。");
                });
              }} />
              <span aria-hidden="true">↓</span><strong>{fileName || "选择 XLSX 文件"}</strong><p>文件仅发送到本机 127.0.0.1 服务解析</p>
              <button className="button button--quiet" type="button" onClick={() => fileInput.current?.click()}>选择文件</button>
            </div>
          ) : (
            <label className="textarea-label">{format === "clipboard" ? "粘贴从金山表格复制的内容" : "粘贴 CSV 文本"}<textarea value={text} onChange={(change) => { setText(change.target.value); setPreview(null); }} placeholder={format === "clipboard" ? "赛区\t赛项\t组别\t选手姓名\t成绩" : "赛区,赛项,组别,选手姓名,成绩"} /></label>
          )}
        </section>
        <section className="panel mapping-panel">
          <h2>2. 确认字段映射</h2>
          <p>字段名必须与源表完全一致，系统不会静默猜测相似字段。</p>
          <div className="mapping-grid">{(Object.keys(labels) as MappingKey[]).map((key) => <label key={key}>{labels[key]}<input value={mapping[key]} onChange={(change) => { setMapping((current) => ({ ...current, [key]: change.target.value })); setPreview(null); }} /></label>)}</div>
          <button className="button button--primary" type="button" onClick={() => void runPreview()} disabled={(format === "xlsx" ? base64 : text).length === 0}>生成导入预览</button>
        </section>
      </div>
      {preview === null ? null : (
        <section className="panel preview-panel">
          <div className="panel-heading"><div><p className="eyebrow">候选快照</p><h2>3. 核对后发布</h2></div><span className="data-type">{preview.hash.slice(0, 12)}</span></div>
          <div className="preview-counts"><div><span>读取记录</span><strong className="data-type">{preview.recordCount}</strong></div><div><span>有效成绩</span><strong className="data-type">{preview.validCount}</strong></div><div><span>异常记录</span><strong className="data-type">{preview.issueCount}</strong></div><div><span>排名分区</span><strong className="data-type">{preview.partitionCount}</strong></div></div>
          {preview.missingRuleEvents.length === 0 ? null : <div className="inline-alert inline-alert--orange">以下赛项尚未配置范围：{preview.missingRuleEvents.join("、")}</div>}
          <div className="preview-evidence">
            <div><h3>识别字段</h3><p>{preview.headers.join("、")}</p></div>
            <div><h3>脱敏样例</h3>{preview.samples.length === 0 ? <p>没有可显示的记录。</p> : <div className="table-scroll"><table className="ranking-table"><thead><tr><th>赛区</th><th>赛项</th><th>组别</th><th>选手</th><th>原始成绩</th></tr></thead><tbody>{preview.samples.map((sample, index) => <tr key={`${sample.participantName}-${index}`}><td>{sample.region}</td><td>{sample.event}</td><td>{sample.group}</td><td>{sample.participantName}</td><td className="data-type">{sample.scoreRaw}</td></tr>)}</tbody></table></div>}</div>
            {preview.issues.length === 0 ? null : <div><h3>首批异常</h3><ul>{preview.issues.slice(0, 10).map((issue) => <li key={`${issue.sourceIndex}-${issue.message}`}>来源行 {issue.sourceIndex + 2}：{issue.message}</li>)}</ul></div>}
          </div>
          <div className="preview-actions"><p>预览样例中的姓名已经脱敏。发布时使用完整本地记录，但不会上传第三方。</p><button className="button button--primary" type="button" onClick={() => void publish()}>发布为当前快照</button></div>
        </section>
      )}
      {message === null ? null : <p className="form-message" role="status">{message}</p>}
    </>
  );
}
