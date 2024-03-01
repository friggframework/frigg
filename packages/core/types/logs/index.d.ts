declare module "@friggframework/logs/logger" {
  export function debug(...messages: any[]): void;
  export function initDebugLog(...initMessages: any[]): void;
  export function flushDebugLog(error: any): void;
}
