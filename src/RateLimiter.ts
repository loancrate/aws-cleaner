import { setTimeout } from "timers/promises";

export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private windowMs: number;
  private fillRate: number;
  private lastFillTime: number;

  public constructor({
    maxTokens = 1,
    initialTokens = maxTokens,
    windowMs,
    fillRate = 1,
  }: {
    maxTokens?: number;
    initialTokens?: number;
    windowMs: number;
    fillRate?: number;
  }) {
    this.tokens = initialTokens;
    this.maxTokens = maxTokens;
    this.windowMs = windowMs;
    this.fillRate = fillRate;
    this.lastFillTime = Date.now();
  }

  public empty(): void {
    this.tokens = 0;
    this.lastFillTime = Date.now();
  }

  public async wait(): Promise<void> {
    this.refill();
    while (!this.tokens) {
      const elapsedMs = Date.now() - this.lastFillTime;
      await setTimeout(this.windowMs / this.fillRate - elapsedMs);
      this.refill();
    }
    --this.tokens;
  }

  private refill(): void {
    const elapsedMs = Date.now() - this.lastFillTime;
    const newTokens = Math.floor((elapsedMs / this.windowMs) * this.fillRate);
    if (newTokens >= 1) {
      this.tokens = Math.min(this.tokens + newTokens, this.maxTokens);
      this.lastFillTime += Math.ceil((newTokens / this.fillRate) * this.windowMs);
    }
  }
}
