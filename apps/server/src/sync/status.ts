import type { SnapshotSummary, SyncState } from "@xinxisuyang/domain";

export class SyncStatusStore {
  #state: SyncState = "manual-only";
  #lastErrorCode: string | null = null;
  #lastSuccess: SnapshotSummary | null = null;
  #lastSuccessAt: string | null = null;

  get() {
    return {
      state: this.#state,
      lastErrorCode: this.#lastErrorCode,
      lastSuccessAt: this.#lastSuccessAt,
      snapshot: this.#lastSuccess,
    };
  }

  begin(): void {
    this.#state = "syncing";
    this.#lastErrorCode = null;
  }

  succeed(snapshot: SnapshotSummary, succeededAt = new Date().toISOString()): void {
    this.#state = "synced";
    this.#lastSuccess = snapshot;
    this.#lastSuccessAt = succeededAt;
    this.#lastErrorCode = null;
  }

  setSnapshot(snapshot: SnapshotSummary): void {
    this.#lastSuccess = snapshot;
    if (this.#state === "manual-only") this.#state = "synced";
  }

  fail(errorCode: string): void {
    this.#state = "failed";
    this.#lastErrorCode = errorCode;
  }
}
