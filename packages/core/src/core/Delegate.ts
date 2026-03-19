import { get } from '../assertions';

export interface DelegateParams {
    delegate?: Delegate | null;
    [key: string]: unknown;
}

export class Delegate {
    delegate: Delegate | null;
    delegateTypes: string[];

    constructor(params: DelegateParams) {
        this.delegate = get(params, 'delegate', null) as Delegate | null;
        this.delegateTypes = [];
    }

    async notify(delegateString: string, object: unknown = null): Promise<unknown> {
        if (!this.delegateTypes.includes(delegateString)) {
            throw new Error(
                `delegateString:${delegateString} is not defined in delegateTypes`
            );
        }
        if (this.delegate) {
            return this.delegate.receiveNotification(
                this,
                delegateString,
                object
            );
        }
    }

    async receiveNotification(
        notifier: Delegate,
        delegateString: string,
        object: unknown = null
    ): Promise<unknown> {
        // Override in subclasses
        return undefined;
    }
}

