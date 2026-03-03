declare module "@friggframework/database" {
  export const prisma: any;
  export function connectPrisma(): Promise<any>;
  export function disconnectPrisma(): Promise<void>;
}
