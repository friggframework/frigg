/// <reference path="../index.d.ts" />
import { RateLimitError } from "@friggframework/core";

const error = new RateLimitError({ waitMs: 1_000 });
const isRateLimited: true = error.isRateLimited;
const retryAt: Date | undefined = error.retryAt;

export { isRateLimited, retryAt };
