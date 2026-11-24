const path = require('node:path');
const ts = require('typescript');

function strictDiagnostics(fileName) {
    const program = ts.createProgram([fileName], {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        lib: ['lib.es2022.d.ts'],
        module: ts.ModuleKind.CommonJS,
    });
    return ts
        .getPreEmitDiagnostics(program)
        .map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        );
}

describe('@friggframework/core type declarations', () => {
    it('type-check a strict consumer of the rate-limit exports', () => {
        expect(
            strictDiagnostics(path.join(__dirname, 'consumer.fixture.ts'))
        ).toEqual([]);
    }, 30_000);
});
