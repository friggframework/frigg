const VALID_ACTIONS = ['add', 'remove', 'replace', 'rename', 'update'];

class FixSuggestion {
    constructor({ action, description, template, codeSnippet, targetPath, targetFile }) {
        if (!action) {
            throw new Error('action is required');
        }
        if (!description) {
            throw new Error('description is required');
        }
        if (!VALID_ACTIONS.includes(action)) {
            throw new Error(`Invalid action: ${action}. Must be one of: ${VALID_ACTIONS.join(', ')}`);
        }

        this.action = action;
        this.description = description;
        this.template = template || null;
        this.codeSnippet = codeSnippet || null;
        this.targetPath = targetPath || null;
        this.targetFile = targetFile || null;
    }

    static create(props) {
        return new FixSuggestion(props);
    }

    isAdd() {
        return this.action === 'add';
    }

    isRemove() {
        return this.action === 'remove';
    }

    isReplace() {
        return this.action === 'replace';
    }

    isRename() {
        return this.action === 'rename';
    }

    isUpdate() {
        return this.action === 'update';
    }

    isAutoApplicable() {
        return this.template !== null || this.codeSnippet !== null;
    }

    toJSON() {
        return {
            action: this.action,
            description: this.description,
            template: this.template,
            codeSnippet: this.codeSnippet,
            targetPath: this.targetPath,
            targetFile: this.targetFile
        };
    }

    format() {
        let output = `[${this.action}] ${this.description}`;
        if (this.template) {
            output += `\n  Template: ${JSON.stringify(this.template)}`;
        }
        if (this.codeSnippet) {
            output += `\n  Code: ${this.codeSnippet}`;
        }
        return output;
    }
}

module.exports = { FixSuggestion };
