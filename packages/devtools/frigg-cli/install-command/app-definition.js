const fs = require('fs');
const { parse } = require('@babel/parser');

const PARSE_OPTIONS = {
    sourceType: 'unambiguous',
    allowReturnOutsideFunction: true,
    plugins: ['jsx', 'classProperties', 'objectRestSpread'],
};

/**
 * Find the single `integrations: [...]` array literal in a parsed file.
 * Returns null unless there is exactly one, so an ambiguous file is never
 * edited.
 */
function findIntegrationsArray(ast) {
    const found = [];
    const visit = (node) => {
        if (!node || typeof node.type !== 'string') return;
        if (
            (node.type === 'ObjectProperty' || node.type === 'Property') &&
            !node.computed &&
            ((node.key.type === 'Identifier' &&
                node.key.name === 'integrations') ||
                (node.key.type === 'StringLiteral' &&
                    node.key.value === 'integrations')) &&
            node.value.type === 'ArrayExpression'
        ) {
            found.push(node.value);
        }
        for (const key of Object.keys(node)) {
            if (key === 'loc' || key === 'start' || key === 'end') continue;
            const child = node[key];
            if (Array.isArray(child)) child.forEach(visit);
            else if (child && typeof child.type === 'string') visit(child);
        }
    };
    visit(ast.program);
    return found.length === 1 ? found[0] : null;
}

function isRequireDeclaration(statement) {
    return (
        statement.type === 'VariableDeclaration' &&
        statement.declarations.some(
            (d) =>
                d.init &&
                d.init.type === 'CallExpression' &&
                d.init.callee.type === 'Identifier' &&
                d.init.callee.name === 'require'
        )
    );
}

function hasTopLevelRequire(ast) {
    return ast.program.body.some(isRequireDeclaration);
}

/** Offset just after the last top-level `require` declaration, or after 'use strict', or 0. */
function findRequireInsertionPoint(ast) {
    let offset = null;
    for (const statement of ast.program.body) {
        if (isRequireDeclaration(statement)) {
            offset = statement.end;
        }
    }
    if (offset !== null) return offset;
    const directives = ast.program.directives || [];
    if (directives.length > 0) return directives[directives.length - 1].end;
    return 0;
}

function lineIndentAt(source, offset) {
    const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
    const match = /^[ \t]*/.exec(source.slice(lineStart));
    return match ? match[0] : '';
}

/**
 * Register an integration class in the app definition file (`index.js`).
 *
 * Adds `const <ClassName> = require('<requirePath>');` after the last
 * top-level require and `<ClassName>,` as the first entry of the one
 * `integrations: [...]` array. The file is only written when it parses, has
 * exactly one `integrations` array literal, and still parses after the edit;
 * otherwise nothing is changed and the caller prints manual steps.
 *
 * @param {string} filePath - The app definition file (index.js)
 * @param {string} className - e.g. `HubSpotIntegration`
 * @param {string} requirePath - e.g. `./src/integrations/HubSpotIntegration`
 * @returns {{ status: 'registered'|'already-registered'|'manual', reason?: string }}
 */
function registerIntegration(filePath, className, requirePath) {
    let source;
    try {
        source = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        return { status: 'manual', reason: `cannot read ${filePath}` };
    }

    let ast;
    try {
        ast = parse(source, PARSE_OPTIONS);
    } catch (error) {
        return { status: 'manual', reason: `cannot parse ${filePath}` };
    }

    const array = findIntegrationsArray(ast);
    if (!array) {
        return {
            status: 'manual',
            reason: 'expected exactly one `integrations: [...]` array literal',
        };
    }

    const alreadyListed = array.elements.some(
        (el) => el && el.type === 'Identifier' && el.name === className
    );
    const requireLine = `const ${className} = require('${requirePath}');`;
    const alreadyRequired = source.includes(`require('${requirePath}')`);
    if (alreadyListed && alreadyRequired) {
        return { status: 'already-registered' };
    }
    if (alreadyListed !== alreadyRequired) {
        return {
            status: 'manual',
            reason: `${className} is partly registered already`,
        };
    }

    const baseIndent = lineIndentAt(source, array.start);
    const itemIndent = `${baseIndent}    `;
    const inner = source.slice(array.start + 1, array.end - 1);
    let arrayText;
    if (inner.trim() === '') {
        arrayText = `[\n${itemIndent}${className},\n${baseIndent}]`;
    } else {
        arrayText = `[\n${itemIndent}${className},${
            inner.startsWith('\n') ? '' : `\n${itemIndent}`
        }${inner}]`;
    }

    const at = findRequireInsertionPoint(ast);
    let requireText;
    if (at === 0) {
        requireText = `${requireLine}\n`;
    } else if (hasTopLevelRequire(ast)) {
        requireText = `\n${requireLine}`;
    } else {
        requireText = `\n\n${requireLine}`;
    }

    // Apply the later edit first so the earlier offset stays valid.
    const edits = [
        { start: array.start, end: array.end, text: arrayText },
        { start: at, end: at, text: requireText },
    ].sort((a, b) => b.start - a.start);
    let updated = source;
    for (const edit of edits) {
        updated =
            updated.slice(0, edit.start) + edit.text + updated.slice(edit.end);
    }

    try {
        const check = parse(updated, PARSE_OPTIONS);
        if (!findIntegrationsArray(check)) throw new Error('lost array');
    } catch (error) {
        return { status: 'manual', reason: 'the edited file would not parse' };
    }

    fs.writeFileSync(filePath, updated);
    return { status: 'registered' };
}

module.exports = { registerIntegration };
