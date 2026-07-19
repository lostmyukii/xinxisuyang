import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FreshnessHalo } from "../src/features/dashboard/FreshnessHalo.js";

describe("FreshnessHalo", () => {
  it("expresses stale state with text and icon", () => {
    render(<FreshnessHalo freshness="stale" lastSuccessAt="2026-07-19T06:00:00.000Z" />);
    expect(screen.getByLabelText("数据状态：可能已过期")).toBeDefined();
    expect(screen.getByText("超过两分钟未成功更新")).toBeDefined();
    expect(screen.getByText("!")).toBeDefined();
  });
});
