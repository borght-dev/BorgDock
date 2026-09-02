/** While hidden, only every Nth scheduled cycle actually runs. */
export const HIDDEN_CYCLE_DIVISOR = 4;

export class PollingManager<T> {
  private readonly pollFn: () => Promise<T>;
  private readonly baseIntervalMs: number;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private _isPolling = false;
  private _stopped = false;
  private _hidden = false;
  private _hiddenSkips = 0;
  private _lastPollTime: Date | null = null;
  private _error: Error | null = null;
  private _onResult: ((result: T) => void) | null = null;
  private _onError: ((error: Error) => void) | null = null;
  private _isRateLimitLow: () => boolean = () => false;

  constructor(pollFn: () => Promise<T>, intervalMs: number) {
    this.pollFn = pollFn;
    this.baseIntervalMs = intervalMs;
  }

  get isPolling(): boolean {
    return this._isPolling;
  }

  get lastPollTime(): Date | null {
    return this._lastPollTime;
  }

  get error(): Error | null {
    return this._error;
  }

  /** True while the consumer has told us nobody is looking (window hidden, flyout closed). */
  get isHidden(): boolean {
    return this._hidden;
  }

  /**
   * Visibility gate. While hidden, only every {@link HIDDEN_CYCLE_DIVISOR}th
   * scheduled cycle runs (notifications keep flowing at ÷4 cadence). On reveal,
   * poll immediately if the last successful poll is older than the interval.
   * `pollNow()` is never gated.
   */
  setHidden(hidden: boolean): void {
    if (this._hidden === hidden) return;
    this._hidden = hidden;
    this._hiddenSkips = 0;
    if (hidden || this._stopped || this.timerId === null || this._isPolling) return;

    const last = this._lastPollTime?.getTime() ?? 0;
    if (Date.now() - last < this.baseIntervalMs) return;

    clearTimeout(this.timerId);
    this.timerId = null;
    this.scheduleNext(0);
  }

  set onResult(callback: ((result: T) => void) | null) {
    this._onResult = callback;
  }

  set onError(callback: ((error: Error) => void) | null) {
    this._onError = callback;
  }

  /**
   * Provide a function that checks if rate limit is low.
   * When low, polling interval doubles automatically.
   */
  set rateLimitChecker(checker: () => boolean) {
    this._isRateLimitLow = checker;
  }

  start(): void {
    this._stopped = false;
    if (this.timerId !== null) return;
    this.scheduleNext(0);
  }

  /** Start polling but wait a full interval before the first poll. */
  startDeferred(): void {
    this._stopped = false;
    if (this.timerId !== null) return;
    this.scheduleNext();
  }

  stop(): void {
    this._stopped = true;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  async pollNow(): Promise<void> {
    if (this._isPolling) return;
    await this.executePoll();
  }

  private scheduleNext(delayMs?: number): void {
    if (this._stopped) return;
    const delay = delayMs ?? this.getAdaptiveInterval();
    this.timerId = setTimeout(() => {
      if (this._hidden && ++this._hiddenSkips % HIDDEN_CYCLE_DIVISOR !== 0) {
        // Nobody is looking — skip this cycle, keep the schedule alive.
        if (this.timerId !== null) this.scheduleNext();
        return;
      }
      this.executePoll().then(() => {
        if (this.timerId !== null) {
          this.scheduleNext();
        }
      });
    }, delay);
  }

  private async executePoll(): Promise<void> {
    if (this._stopped) return;
    this._isPolling = true;
    this._error = null;

    try {
      const result = await this.pollFn();
      this._lastPollTime = new Date();
      this._onResult?.(result);
    } catch (error) {
      this._error = error instanceof Error ? error : new Error(String(error));
      this._onError?.(this._error);
    } finally {
      this._isPolling = false;
    }
  }

  private getAdaptiveInterval(): number {
    // Double interval when rate limit is low
    if (this._isRateLimitLow()) {
      return this.baseIntervalMs * 2;
    }
    return this.baseIntervalMs;
  }
}
