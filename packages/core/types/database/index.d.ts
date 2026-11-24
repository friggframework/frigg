declare module "@friggframework/database" {
  export const prisma: any;
  export function connectPrisma(): Promise<any>;
  export function disconnectPrisma(): Promise<void>;
  export class TokenRepository {
    constructor(params: { prismaClient: any });
  }
  export class WebsocketConnectionRepository {
    constructor(params: { prismaClient: any });
  }
}
