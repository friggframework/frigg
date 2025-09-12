const { Command } = require('commander');

describe('frigg CLI init command', () => {
  const setupProgram = action => {
    const program = new Command();
    program
      .command('init [projectName]')
      .option('-m, --mode <mode>', 'deployment mode (embedded|standalone)')
      .option('--frontend', 'include demo frontend')
      .option('--no-frontend', 'skip demo frontend')
      .option('--no-interactive', 'run without interactive prompts')
      .option('-f, --force', 'overwrite existing directory')
      .option('-v, --verbose', 'enable verbose output')
      .action(action);
    return program;
  };

  it('parses flags and forwards them to initCommand', async () => {
    const mockInit = jest.fn();
    const program = setupProgram(mockInit);

    await program.parseAsync([
      'node',
      'test',
      'init',
      'my-app',
      '--mode',
      'standalone',
      '--no-frontend',
      '--no-interactive',
      '--force',
      '--verbose'
    ]);

    expect(mockInit).toHaveBeenCalledWith(
      'my-app',
      expect.objectContaining({
        mode: 'standalone',
        frontend: false,
        interactive: false,
        force: true,
        verbose: true
      }),
      expect.anything()
    );
  });
});

