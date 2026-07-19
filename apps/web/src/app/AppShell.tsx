import type { ReactNode } from "react";
import { navigation } from "./navigation.js";

export interface AppShellProps {
  path: string;
  children: ReactNode;
}

export function AppShell({ path, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="返回赛事指挥台">
          <span className="brand-mark" aria-hidden="true">信</span>
          <span><strong>信息素养大赛</strong><small>成绩核对系统</small></span>
        </a>
        <nav aria-label="管理后台">
          {navigation.map((item) => (
            <a key={item.path} href={item.path} className={path === item.path ? "is-active" : undefined}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>
        <a className="display-link" href="/display" target="_blank" rel="noreferrer">
          打开脱敏展示大屏 <span aria-hidden="true">↗</span>
        </a>
        <p className="sidebar-foot">数据仅保存在本机</p>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
