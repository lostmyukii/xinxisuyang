import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FreshnessHalo } from "../src/features/dashboard/FreshnessHalo.js";

describe("FreshnessHalo", () => {
  it("expresses stale state with text and icon", () => {
    render(<FreshnessHalo freshness="stale" lastSuccessAt="2026-07-19T06:00:00.000Z" lastErrorCode="IMPORT_PREVIEW_REQUIRED" settings={{ staleAfterSeconds: 120, criticalAfterSeconds: 300 }} />);
    expect(screen.getByLabelText("数据状态：可能已过期")).toBeDefined();
    expect(screen.getByText("超过 120 秒未成功校验")).toBeDefined();
    expect(screen.getByText("!")).toBeDefined();
    expect(screen.getByText("查看状态详情")).toBeDefined();
  });
});
