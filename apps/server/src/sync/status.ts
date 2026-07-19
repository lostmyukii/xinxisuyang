import type { SnapshotSummary, SyncState } from "@xinxisuyang/domain";

export class SyncStatusStore {
  #state: SyncState = "manual-only";
  #lastErrorCode: string | null = null;
  #lastSuccess: SnapshotSummary | null = null;

  get() {
    return {
      state: this.#state,
      lastErrorCode: this.#lastErrorCode,
      lastSuccessAt: this.#lastSuccess?.createdAt ?? null,
      snapshot: this.#lastSuccess,
    };
  }

  begin(): void {
    this.#state = "syncing";
    this.#lastErrorCode = null;
  }

  succeed(snapshot: SnapshotSummary): void {
    this.#state = "synced";
    this.#lastSuccess = snapshot;
    this.#lastErrorCode = null;
  }

  fail(errorCode: string): void {
    this.#state = "failed";
    this.#lastErrorCode = errorCode;
  }
}
