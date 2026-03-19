declare module 'fs-extra' {
    export function existsSync(path: string): boolean;
    export function readFileSync(path: string, encoding?: string): string;
    export function writeFileSync(path: string, data: string): void;
    export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

declare module 'lodash.get' {
    function lodashGet(object: unknown, path: string | string[], defaultValue?: unknown): unknown;
    export = lodashGet;
}

declare module 'bcryptjs' {
    export function hash(s: string, salt: number | string): Promise<string>;
    export function compare(s: string, hash: string): Promise<boolean>;
    export function hashSync(s: string, salt: number | string): string;
    export function compareSync(s: string, hash: string): boolean;
    export function genSalt(rounds?: number): Promise<string>;
    export function genSaltSync(rounds?: number): string;
}

declare module 'md5' {
    function md5(message: string | Buffer): string;
    export = md5;
}

declare module 'moment' {
    interface Moment {
        format(formatString?: string): string;
    }
    function moment(): Moment;
    export = moment;
}

declare module 'uuid' {
    export function v4(): string;
}

declare module 'express-async-handler' {
    import type { RequestHandler } from 'express';
    function catchAsyncError(fn: (...args: any[]) => Promise<any>): RequestHandler;
    export = catchAsyncError;
}

declare module 'cors' {
    import type { RequestHandler } from 'express';
    function cors(options?: any): RequestHandler;
    export = cors;
}

declare module 'body-parser' {
    import type { RequestHandler } from 'express';
    export function json(options?: any): RequestHandler;
    export function urlencoded(options?: any): RequestHandler;
}

declare module 'node-fetch' {
    interface Headers {
        get(name: string): string | null;
        forEach(callback: (value: string, name: string) => void): void;
        entries(): IterableIterator<[string, string]>;
        [Symbol.iterator](): IterableIterator<[string, string]>;
    }

    interface Response {
        readonly ok: boolean;
        readonly status: number;
        readonly statusText: string;
        readonly headers: Headers;
        readonly body: NodeJS.ReadableStream | null;
        json(): Promise<unknown>;
        text(): Promise<string>;
        buffer(): Promise<Buffer>;
        arrayBuffer(): Promise<ArrayBuffer>;
        clone(): Response;
    }

    interface RequestInit {
        method?: string;
        headers?: Record<string, string> | Headers;
        body?: string | Buffer | URLSearchParams | NodeJS.ReadableStream | null;
        redirect?: 'follow' | 'error' | 'manual';
        signal?: AbortSignal | null;
        agent?: import('http').Agent | ((parsedUrl: URL) => import('http').Agent);
        compress?: boolean;
        follow?: number;
        size?: number;
        timeout?: number;
    }

    function fetch(url: string, init?: RequestInit): Promise<Response>;
    export default fetch;
    export { Response, RequestInit, Headers };
}

declare module '@aws-sdk/client-s3' {
    export class S3Client {
        constructor(config?: { region?: string });
        send(command: any): Promise<any>;
    }
    export class PutObjectCommand {
        constructor(input: {
            Bucket: string;
            Key: string;
            Body: string;
            ContentType?: string;
        });
    }
    export class GetObjectCommand {
        constructor(input: {
            Bucket: string;
            Key: string;
        });
    }
}

declare module '@aws-sdk/client-scheduler' {
    export class SchedulerClient {
        constructor(config?: { region?: string });
        send(command: any): Promise<any>;
    }
    export class CreateScheduleCommand {
        constructor(input: any);
    }
    export class DeleteScheduleCommand {
        constructor(input: any);
    }
    export class GetScheduleCommand {
        constructor(input: any);
    }
    export class ResourceNotFoundException extends Error {
        constructor(message?: string);
    }
}
