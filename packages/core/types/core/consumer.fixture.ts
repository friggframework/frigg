/// <reference path="../index.d.ts" />
import { RateLimitError, parseResetHeaders } from "@friggframework/core";
import type { RateLimitPolicy } from "@friggframework/module-plugin";

const error = new RateLimitError({ waitMs: 1_000 });
const isRateLimited: true = error.isRateLimited;
const retryAt: Date | undefined = error.retryAt;

const policy: RateLimitPolicy = { resetDeltaUnit: "ms" };
const hint = parseResetHeaders({}, { now: 0, resetDeltaUnit: "ms" });

export { isRateLimited, retryAt, policy, hint };
