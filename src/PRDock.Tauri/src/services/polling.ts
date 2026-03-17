export class PollingManager<T> {
  private readonly pollFn: () => Promise<T>;
  private readonly baseIntervalMs: number;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private _isPolling = false;
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
    if (this.timerId !== null) return;
    this.scheduleNext(0);
  }

  stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this._isPolling = false;
  }

  async pollNow(): Promise<void> {
    if (this._isPolling) return;
    await this.executePoll();
  }

  private scheduleNext(delayMs?: number): void {
    const delay = delayMs ?? this.getAdaptiveInterval();
    this.timerId = setTimeout(() => {
      this.executePoll().then(() => {
        if (this.timerId !== null) {
          this.scheduleNext();
        }
      });
    }, delay);
  }

  private async executePoll(): Promise<void> {
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
