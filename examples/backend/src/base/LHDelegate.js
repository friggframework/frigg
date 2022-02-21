const LHBaseClass = require('./LHBaseClass');

class LHDelegate extends LHBaseClass {
    constructor(params) {
        super(params);
        this.delegate = this.getParam(params, 'delegate', null);
        this.delegateTypes = [];
    }

    async notify(delegateString, object = null) {
        if (!this.delegateTypes.includes(delegateString)) {
            throw new Error(
                `delegateString:${delegateString} is not defined in delegateTypes`
            );
        }
        if (this.delegate) {
            await this.delegate.receiveNotification(
                this,
                delegateString,
                object
            );
        }
    }

    async receiveNotification(notifier, delegateString, object = null) {
        // ...
    }
}

module.exports = LHDelegate;
