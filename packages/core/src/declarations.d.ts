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
