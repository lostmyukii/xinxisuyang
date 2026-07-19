import { AppShell } from "./AppShell.js";
import { DashboardPage } from "../features/dashboard/DashboardPage.js";
import { DisplayPage } from "../features/display/DisplayPage.js";
import { ExportPage } from "../features/exports/ExportPage.js";
import { ImportPage } from "../features/import/ImportPage.js";
import { IssuesPage } from "../features/issues/IssuesPage.js";
import { RankingsPage } from "../features/rankings/RankingsPage.js";
import { RulesPage } from "../features/rules/RulesPage.js";
import { SnapshotsPage } from "../features/snapshots/SnapshotsPage.js";

const pages: Record<string, () => React.JSX.Element> = {
  "/": DashboardPage,
  "/rankings": RankingsPage,
  "/issues": IssuesPage,
  "/rules": RulesPage,
  "/import": ImportPage,
  "/snapshots": SnapshotsPage,
  "/exports": ExportPage,
};

export function App() {
  const path = window.location.pathname.replace(/\/$/u, "") || "/";
  if (path === "/display") return <DisplayPage />;
  const Page = pages[path] ?? DashboardPage;
  return <AppShell path={path}><Page /></AppShell>;
}
