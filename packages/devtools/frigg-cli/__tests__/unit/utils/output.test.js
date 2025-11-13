/**
 * Tests for unified Output utility
 */

const output = require('../../../utils/output');

describe('Output Utility', () => {
  // Mock console methods
  let originalConsole;

  beforeEach(() => {
    originalConsole = { ...console };
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  afterEach(() => {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
  });

  describe('success()', () => {
    it('should display success message with checkmark', () => {
      output.success('Operation completed');
      expect(console.log).toHaveBeenCalled();
      const args = console.log.mock.calls[0];
      expect(args.join(' ')).toContain('Operation completed');
    });
  });

  describe('error()', () => {
    it('should display error message with X mark', () => {
      output.error('Operation failed');
      expect(console.error).toHaveBeenCalled();
      const args = console.error.mock.calls[0];
      expect(args.join(' ')).toContain('Operation failed');
    });

    it('should display error stack in debug mode', () => {
      const originalDebug = process.env.DEBUG;
      process.env.DEBUG = 'true';

      const error = new Error('Test error');
      output.error('Operation failed', error);

      expect(console.error).toHaveBeenCalledTimes(2);

      process.env.DEBUG = originalDebug;
    });
  });

  describe('info()', () => {
    it('should display info message', () => {
      output.info('Information message');
      expect(console.log).toHaveBeenCalled();
      const args = console.log.mock.calls[0];
      expect(args.join(' ')).toContain('Information message');
    });
  });

  describe('warn()', () => {
    it('should display warning message', () => {
      output.warn('Warning message');
      expect(console.warn).toHaveBeenCalled();
      const args = console.warn.mock.calls[0];
      expect(args.join(' ')).toContain('Warning message');
    });
  });

  describe('header()', () => {
    it('should display formatted header', () => {
      output.header('Test Header');
      expect(console.log).toHaveBeenCalledTimes(3); // empty line, title, separator
    });
  });

  describe('table()', () => {
    it('should display table with data', () => {
      const data = [
        { name: 'Module A', version: '1.0.0', status: 'active' },
        { name: 'Module B', version: '2.1.0', status: 'inactive' }
      ];

      output.table(data);
      expect(console.log).toHaveBeenCalled();
      expect(console.log.mock.calls.length).toBeGreaterThan(3); // header + separator + rows
    });

    it('should handle empty data', () => {
      output.table([]);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No data'));
    });

    it('should handle specific columns', () => {
      const data = [
        { name: 'Module A', version: '1.0.0', status: 'active', extra: 'ignored' }
      ];

      output.table(data, ['name', 'version']);
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('keyValue()', () => {
    it('should display key-value pairs', () => {
      const data = {
        'Module Name': 'test-module',
        'Version': '1.0.0',
        'Status': 'active'
      };

      output.keyValue(data);
      expect(console.log).toHaveBeenCalledTimes(3);
    });
  });

  describe('json()', () => {
    it('should display formatted JSON', () => {
      const data = { name: 'test', version: '1.0.0', active: true };

      output.json(data);
      expect(console.log).toHaveBeenCalled();
      const output_text = console.log.mock.calls[0][0];
      expect(output_text).toContain('name');
      expect(output_text).toContain('1.0.0');
    });
  });

  describe('spinner()', () => {
    jest.useFakeTimers();

    it('should create and control spinner', () => {
      const spinner = output.spinner('Loading...');

      // Spinner should have control methods
      expect(spinner).toHaveProperty('update');
      expect(spinner).toHaveProperty('succeed');
      expect(spinner).toHaveProperty('fail');
      expect(spinner).toHaveProperty('stop');

      spinner.stop();
    });

    it('should succeed with message', () => {
      const spinner = output.spinner('Loading...');
      spinner.succeed('Loaded successfully');

      expect(console.log).toHaveBeenCalled();
    });

    it('should fail with message', () => {
      const spinner = output.spinner('Loading...');
      spinner.fail('Loading failed');

      expect(console.error).toHaveBeenCalled();
    });

    jest.useRealTimers();
  });

  describe('progress()', () => {
    let originalStdout;

    beforeEach(() => {
      originalStdout = process.stdout.write;
      process.stdout.write = jest.fn();
    });

    afterEach(() => {
      process.stdout.write = originalStdout;
    });

    it('should display progress bar', () => {
      output.progress(50, 100, 'Processing...');
      expect(process.stdout.write).toHaveBeenCalled();

      const output_text = process.stdout.write.mock.calls[0][0];
      expect(output_text).toContain('%');
      expect(output_text).toContain('Processing...');
    });

    it('should complete progress bar', () => {
      output.progress(100, 100);
      expect(console.log).toHaveBeenCalled(); // Newline on completion
    });
  });

  describe('log()', () => {
    it('should log raw messages', () => {
      output.log('Raw message');
      expect(console.log).toHaveBeenCalledWith('Raw message');
    });
  });
});
