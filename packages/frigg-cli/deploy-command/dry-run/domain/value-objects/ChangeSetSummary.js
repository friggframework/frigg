class ChangeSetSummary {
    constructor({ add = 0, modify = 0, remove = 0, replace = 0 }) {
        if (add < 0 || modify < 0 || remove < 0 || replace < 0) {
            throw new Error('Change counts must be non-negative');
        }

        this._add = add;
        this._modify = modify;
        this._remove = remove;
        this._replace = replace;

        Object.freeze(this);
    }

    get add() {
        return this._add;
    }

    get modify() {
        return this._modify;
    }

    get remove() {
        return this._remove;
    }

    get replace() {
        return this._replace;
    }

    get total() {
        return this._add + this._modify + this._remove;
    }

    hasChanges() {
        return this.total > 0;
    }

    hasCriticalChanges() {
        return this._replace > 0 || this._remove > 0;
    }

    toObject() {
        return {
            add: this._add,
            modify: this._modify,
            remove: this._remove,
            replace: this._replace,
            total: this.total,
        };
    }

    static empty() {
        return new ChangeSetSummary({ add: 0, modify: 0, remove: 0, replace: 0 });
    }

    static fromChanges(changes) {
        const summary = { add: 0, modify: 0, remove: 0, replace: 0 };

        for (const change of changes) {
            const action = change.ResourceChange?.Action || change.Action;
            const replacement = change.ResourceChange?.Replacement;

            if (action === 'Add') summary.add++;
            else if (action === 'Modify') {
                if (replacement === 'True') summary.replace++;
                else summary.modify++;
            } else if (action === 'Remove') summary.remove++;
        }

        return new ChangeSetSummary(summary);
    }
}

module.exports = { ChangeSetSummary };
