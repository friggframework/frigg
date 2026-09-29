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

    clearRateLimitWait(body: object): Promise<void>;
  }

  export type RateLimitWaitState = {
    status: "WAITING" | "EXHAUSTED";
    mechanism: "delay" | "schedule" | "visibility" | "none";
    deferrals: number;
    retryAt: Date;
  };

  interface IWorker {
    getQueueURL(params: GetQueueURLParams): Promise<string | undefined>;
    run(params: { Records: any }, context?: object): Promise<BatchItemFailuresResponse>;
    send(params: object & { QueueUrl: any }, delay?: number): Promise<string>;
    sendAsyncSQSMessage(params: SendSQSMessageParams): Promise<string>;
  }

  export function loadInstalledModules(): any[];

  /**
   * Runs `fn` with the time the invocation ends, as epoch milliseconds. A
   * nested scope can shorten the deadline and never extend it.
   */
  export function runWithInvocationDeadline<T>(
    deadlineAt: number | undefined,
    fn: () => T
  ): T;

  /** Milliseconds left in the invocation. `Infinity` outside a Lambda. */
  export function remainingInvocationMs(now?: number): number;

  /**
   * Finds the hint of a throttled response: the module's classify(), then the
   * header parsers, then the static policy. Null when there is none.
   */
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
