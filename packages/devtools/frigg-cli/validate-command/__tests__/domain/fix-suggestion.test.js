const { FixSuggestion } = require('../../domain/value-objects/fix-suggestion');

describe('FixSuggestion', () => {
    describe('creation', () => {
        it('creates fix with action and description', () => {
            const fix = FixSuggestion.create({
                action: 'add',
                description: 'Add the name field to the configuration'
            });
            expect(fix.action).toBe('add');
            expect(fix.description).toBe('Add the name field to the configuration');
        });

        it('creates fix with template', () => {
            const fix = FixSuggestion.create({
                action: 'add',
                description: 'Add database configuration',
                template: { database: { mongoDB: { enable: true } } }
            });
            expect(fix.template).toEqual({ database: { mongoDB: { enable: true } } });
        });

        it('creates fix with code snippet', () => {
            const fix = FixSuggestion.create({
                action: 'replace',
                description: 'Update the export',
                codeSnippet: 'module.exports = { Definition };'
            });
            expect(fix.codeSnippet).toBe('module.exports = { Definition };');
        });

        it('throws for missing action', () => {
            expect(() => FixSuggestion.create({ description: 'Fix it' }))
                .toThrow('action is required');
        });

        it('throws for missing description', () => {
            expect(() => FixSuggestion.create({ action: 'add' }))
                .toThrow('description is required');
        });

        it('throws for invalid action', () => {
            expect(() => FixSuggestion.create({ action: 'destroy', description: 'd' }))
                .toThrow('Invalid action');
        });
    });

    describe('actions', () => {
        it('supports add action', () => {
            const fix = FixSuggestion.create({ action: 'add', description: 'd' });
            expect(fix.isAdd()).toBe(true);
            expect(fix.isRemove()).toBe(false);
        });

        it('supports remove action', () => {
            const fix = FixSuggestion.create({ action: 'remove', description: 'd' });
            expect(fix.isRemove()).toBe(true);
        });

        it('supports replace action', () => {
            const fix = FixSuggestion.create({ action: 'replace', description: 'd' });
            expect(fix.isReplace()).toBe(true);
        });

        it('supports rename action', () => {
            const fix = FixSuggestion.create({ action: 'rename', description: 'd' });
            expect(fix.isRename()).toBe(true);
        });

        it('supports update action', () => {
            const fix = FixSuggestion.create({ action: 'update', description: 'd' });
            expect(fix.isUpdate()).toBe(true);
        });
    });

    describe('applicability', () => {
        it('is auto-applicable with template', () => {
            const fix = FixSuggestion.create({
                action: 'add',
                description: 'd',
                template: { key: 'value' }
            });
            expect(fix.isAutoApplicable()).toBe(true);
        });

        it('is auto-applicable with code snippet', () => {
            const fix = FixSuggestion.create({
                action: 'replace',
                description: 'd',
                codeSnippet: 'const x = 1;'
            });
            expect(fix.isAutoApplicable()).toBe(true);
        });

        it('is not auto-applicable without template or snippet', () => {
            const fix = FixSuggestion.create({ action: 'add', description: 'd' });
            expect(fix.isAutoApplicable()).toBe(false);
        });
    });

    describe('target', () => {
        it('sets target path', () => {
            const fix = FixSuggestion.create({
                action: 'add',
                description: 'd',
                targetPath: 'config.database'
            });
            expect(fix.targetPath).toBe('config.database');
        });

        it('sets target file', () => {
            const fix = FixSuggestion.create({
                action: 'update',
                description: 'd',
                targetFile: 'backend/index.js'
            });
            expect(fix.targetFile).toBe('backend/index.js');
        });
    });

    describe('serialization', () => {
        it('converts to JSON', () => {
            const fix = FixSuggestion.create({
                action: 'add',
                description: 'Add config',
                template: { key: 'value' },
                targetPath: 'config'
            });
            const json = fix.toJSON();
            expect(json).toEqual({
                action: 'add',
                description: 'Add config',
                template: { key: 'value' },
                codeSnippet: null,
                targetPath: 'config',
                targetFile: null
            });
        });
    });

    describe('formatting', () => {
        it('formats for console display', () => {
            const fix = FixSuggestion.create({
                action: 'add',
                description: 'Add the name field',
                template: { name: 'my-app' }
            });
            const formatted = fix.format();
            expect(formatted).toContain('add');
            expect(formatted).toContain('Add the name field');
        });
    });
});
