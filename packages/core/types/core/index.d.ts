declare module "@friggframework/core" {
  import { SQS } from "aws-sdk";

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

  export class Worker implements IWorker {
    getQueueURL(params: GetQueueURLParams): Promise<string | undefined>;

    run(params: { Records: any }): Promise<void>;

    send(params: object & { QueueUrl: any }, delay?: number): Promise<string>;

    sendAsyncSQSMessage(params: SendSQSMessageParams): Promise<string>;
  }

  interface IWorker {
    getQueueURL(params: GetQueueURLParams): Promise<string | undefined>;
    run(params: { Records: any }): Promise<void>;
    send(params: object & { QueueUrl: any }, delay?: number): Promise<string>;
    sendAsyncSQSMessage(params: SendSQSMessageParams): Promise<string>;
  }

  export function loadInstalledModules(): any[];

  type GetQueueURLParams = {
    QueueName: string;
    QueueOwnerAWSAccountId?: string;
  };

  type SendSQSMessageParams = SQS.SendMessageRequest;
}
