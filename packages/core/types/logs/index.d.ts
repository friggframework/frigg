declare module "@friggframework/core/logs" {
  export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

  export type LogFields = Record<string, unknown>;

  export interface LogRecord {
    readonly timestamp: string;
    readonly level: LogLevel;
    readonly message: string;
    readonly logger: string;
    readonly [key: string]: unknown;
  }

  export interface Logger {
    readonly name: string;
    trace(message: unknown, fields?: LogFields): void;
    debug(message: unknown, fields?: LogFields): void;
    info(message: unknown, fields?: LogFields): void;
    warn(message: unknown, fields?: LogFields): void;
    error(message: unknown, fields?: LogFields): void;
    fatal(message: unknown, fields?: LogFields): void;
    child(bindings: LogFields | (() => LogFields)): Logger;
    isLevelEnabled(level: string): boolean;
  }

  export interface LogSink {
    name: string;
    write(record: LogRecord): void;
    flush?(options: { signal?: AbortSignal }): Promise<void> | void;
  }

  export interface MemorySink extends LogSink {
    readonly records: LogRecord[];
    clear(): void;
  }

  export interface SerializedError {
    type: string;
    message: string;
    code?: string | number;
    status?: number;
    stack?: string;
    cause?: SerializedError | string;
  }

  export function getLogger(name?: string): Logger;
  export function createMemorySink(options?: { install?: boolean }): MemorySink;
  export function resetLoggerForTests(options?: {
    level?: LogLevel | Lowercase<LogLevel>;
    sinks?: LogSink[];
  }): void;
  export function serializeError(error: unknown): SerializedError;
  export function redactValue(value: unknown): unknown;
  export function toSanitizedSurrogate(error: unknown): Error;

  /** @deprecated Use getLogger or this.logger. */
  export function debug(...messages: any[]): void;
  /** @deprecated Use getLogger or this.logger. */
  export function initDebugLog(...initMessages: any[]): void;
  /** @deprecated Use getLogger or this.logger. */
  export function flushDebugLog(error?: any): void;
}
