const { EsbuildDirectoryManager } = require('./esbuild-directory-manager');

describe('EsbuildDirectoryManager', () => {
  let manager;
  let mockFs;
  let mockPath;

  beforeEach(() => {
    mockFs = {
      existsSync: jest.fn(),
      mkdirSync: jest.fn(),
    };
    mockPath = {
      join: jest.fn((...args) => args.join('/')),
    };
    manager = new EsbuildDirectoryManager(mockFs, mockPath);
  });

  describe('ensureDirectory', () => {
    it('should create directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = manager.ensureDirectory('/test/path');

      expect(mockPath.join).toHaveBeenCalledWith('/test/path', '.esbuild', '.serverless');
      expect(mockFs.existsSync).toHaveBeenCalledWith('/test/path/.esbuild/.serverless');
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/path/.esbuild/.serverless', {
        recursive: true,
      });
      expect(result).toBe('/test/path/.esbuild/.serverless');
    });

    it('should not create directory if it already exists', () => {
      mockFs.existsSync.mockReturnValue(true);

      const result = manager.ensureDirectory('/test/path');

      expect(mockFs.existsSync).toHaveBeenCalledWith('/test/path/.esbuild/.serverless');
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      expect(result).toBe('/test/path/.esbuild/.serverless');
    });

    it('should handle different base paths', () => {
      mockFs.existsSync.mockReturnValue(false);

      manager.ensureDirectory('/different/base');

      expect(mockPath.join).toHaveBeenCalledWith('/different/base', '.esbuild', '.serverless');
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/different/base/.esbuild/.serverless', {
        recursive: true,
      });
    });

    it('should propagate fs errors', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => {
        manager.ensureDirectory('/test/path');
      }).toThrow('Permission denied');
    });
  });
});
