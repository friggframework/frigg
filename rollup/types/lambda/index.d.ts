declare module "@friggframework/lambda/TimeoutCatcher" {
  export class TimeoutCatcher implements IFriggTimeoutCatcher {
    isFinished: boolean;
    waitTime: number;

    constructor(params: TimeoutCatcherConstructor);
    work(): Promise<any>;
    cleanUp(): Promise<any>;
    doWork(): Promise<void>;
    exitBeforeTimeout(): Promise<void>;
    watch(): Promise<boolean>;
  }

  interface IFriggTimeoutCatcher {
    isFinished: boolean;
    work: () => Promise<any>;
    cleanUp: () => Promise<any>;
    waitTime: number;

    watch(): Promise<boolean>;
    doWork(): Promise<void>;
    exitBeforeTimeout(): Promise<void>;
  }

  type TimeoutCatcherConstructor = {
    work: () => Promise<any>;
    timeout: number;
    cleanUp?: () => Promise<any>;
    cleanUpTime?: number;
  };
}
