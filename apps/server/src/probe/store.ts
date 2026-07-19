import type { ProbeReport } from "./schema.js";

export class ProbeStore {
  #latest: ProbeReport | null = null;

  set(report: ProbeReport): void {
    this.#latest = report;
  }

  get(): ProbeReport | null {
    return this.#latest;
  }
}
