import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "../src/index.js";

describe("StatusBadge", () => {
  it("always carries icon and readable text instead of color alone", () => {
    render(<StatusBadge tone="orange" icon="!">数据可能已过期</StatusBadge>);
    expect(screen.getByText("数据可能已过期")).toBeDefined();
    expect(screen.getByText("!")).toBeDefined();
  });
});
