declare module "@friggframework/core" {
  import type { SendMessageCommandInput } from "@aws-sdk/client-sqs";
  import type { RateLimitHint } from "@friggframework/errors";
  import type {
    RateLimitPolicy,
    RateLimitSignal,
  } from "@friggframework/module-plugin";

  export class Delegate implements IFriggDelegate {
    delegate: any;
    delegateTypes: any[];

    constructor(params: Record<string, unknown> & { delegate?: unknown });
    notify(delegateString: string, object?: any): Promise<any>;
    receiveNotification(
      notifier: any,
      delegateString: string,
      object?: any
    ): Promise<any>;
  }

  interface IFriggDelegate {
    delegate: any;
    delegateTypes: any[];

    notify(delegateString: string, object?: any): Promise<any>;
    receiveNotification(
      notifier: any,
      delegateString: string,
      object?: any
    ): Promise<any>;
  }

  export interface BatchItemFailure {
    itemIdentifier: string;
  }

  export interface BatchItemFailuresResponse {
    batchItemFailures: BatchItemFailure[];
  }

  export class Worker implements IWorker {
    getQueueURL(params: GetQueueURLParams): Promise<string | undefined>;

    run(params: { Records: any }, context?: object): Promise<BatchItemFailuresResponse>;

    send(params: object & { QueueUrl: any }, delay?: number): Promise<string>;

    sendAsyncSQSMessage(params: SendSQSMessageParams): Promise<string>;

    recordRateLimitWait(
      body: object,
      error: Error,
      state: RateLimitWaitState
    ): Promise<void>;

    clearRateLimitWait(
      body: object,
      options?: { deferralId?: string }
    ): Promise<void>;

    decideRateLimited(
      event: RateLimitedEvent
    ): Promise<RateLimitedDecision | void>;

    /** Runs past the delay tier, for an unknown retryAt, or at a cap. */
    recordRateLimitMessage(
      body: object,
      error: Error,
      limit: { retryAt: Date; capped: boolean }
    ): Promise<void>;
  }

  /** ADR-049 section 3. The input of the RATE_LIMITED event handler. */
  export type RateLimitedEvent = {
    retryAt?: Date;
    waitMs?: number;
    reason?: string;
    module?: string;
    scopeKey?: string;
    message: object;
    delivery: {
      messageId: string;
      receiveCount?: number;
      deferrals: number;
      deferredMs: number;
    };
  };

  /** `defer` or no value runs the default handler. A throw counts as `retry`. */
  export type RateLimitedDecision = "defer" | "drop" | "retry";

  export type RateLimitWaitState = {
    status: "WAITING" | "EXHAUSTED";
    mechanism: "delay" | "schedule" | "visibility" | "none";
    deferrals: number;
    deferralId?: string;
    retryAt: Date;
  };

  interface IWorker {
    getQueueURL(params: GetQueueURLParams): Promise<string | undefined>;
    run(params: { Records: any }, context?: object): Promise<BatchItemFailuresResponse>;
    send(params: object & { QueueUrl: any }, delay?: number): Promise<string>;
    sendAsyncSQSMessage(params: SendSQSMessageParams): Promise<string>;
  }

  export function loadInstalledModules(): any[];

  export function runWithInvocationDeadline<T>(
    limits: { deadlineAt?: number; maxInProcessWaitMs?: number },
    fn: () => T
  ): T;

  export function remainingInvocationMs(now?: number): number;

  export function classifyRateLimit(
    policy: RateLimitPolicy | undefined,
    signal: RateLimitSignal,
    options?: { now?: number; onClassifyError?: (error: Error) => void }
  ): RateLimitHint | null;

  export function parseRetryAfter(
    value: string | null | undefined,
    options?: { now?: number }
  ): RateLimitHint | null;

  export function parseResetHeaders(
    headers: object | undefined,
    options?: { now?: number }
  ): RateLimitHint | null;

  export function parseIetfRateLimit(
    headers: object | undefined,
    options?: { now?: number }
  ): RateLimitHint | null;

  type GetQueueURLParams = {
    QueueName: string;
    QueueOwnerAWSAccountId?: string;
  };

  type SendSQSMessageParams = SendMessageCommandInput;
}
