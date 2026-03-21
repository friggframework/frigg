declare module '@friggframework/core' {
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

    /** Interface for queue message operations (port in hexagonal architecture) */
    export interface QueueClientInterface {
        sendMessage(params: SendMessageParams): Promise<{ MessageId: string }>;
        sendMessageBatch(params: SendMessageBatchParams): Promise<any>;
        getQueueUrl(params: GetQueueURLParams): Promise<string>;
    }

    export class Worker implements IWorker {
        constructor(options?: { queueClient?: QueueClientInterface });

        getQueueURL(params: GetQueueURLParams): Promise<string | undefined>;

        run(params: { Records: any }): Promise<void>;

        send(
            params: object & { QueueUrl: any },
            delay?: number
        ): Promise<string>;

        sendAsyncSQSMessage(params: SendMessageParams): Promise<string>;
    }

    interface IWorker {
        getQueueURL(params: GetQueueURLParams): Promise<string | undefined>;
        run(params: { Records: any }): Promise<void>;
        send(
            params: object & { QueueUrl: any },
            delay?: number
        ): Promise<string>;
        sendAsyncSQSMessage(params: SendMessageParams): Promise<string>;
    }

    export function loadInstalledModules(): any[];

    type GetQueueURLParams = {
        QueueName: string;
        QueueOwnerAWSAccountId?: string;
    };

    type SendMessageParams = {
        QueueUrl: string;
        MessageBody: string;
        DelaySeconds?: number;
    };

    type SendMessageBatchParams = {
        QueueUrl: string;
        Entries: Array<{ Id: string; MessageBody: string }>;
    };

    /** Interface for envelope encryption key operations */
    export class EncryptionKeyProviderInterface {
        generateDataKey(): Promise<{
            keyId: string;
            encryptedKey: string;
            plaintext: string | Buffer;
        }>;
        decryptDataKey(
            keyId: string,
            encryptedKey: string | Buffer
        ): Promise<string | Buffer>;
    }

    /** Interface for WebSocket message sending */
    export class WebSocketMessageSenderInterface {
        send(connectionId: string, data: any, endpoint: string): Promise<void>;
    }

    export class StaleConnectionError extends Error {
        connectionId: string;
        constructor(connectionId: string);
    }
}
