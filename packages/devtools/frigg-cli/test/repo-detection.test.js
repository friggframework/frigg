const { isFriggRepository } = require('../utils/repo-detection');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('Repository Detection', () => {
    let testDir;
    
    beforeEach(async () => {
        testDir = path.join(os.tmpdir(), 'frigg-test-' + Date.now());
        await fs.ensureDir(testDir);
    });
    
    afterEach(async () => {
        await fs.remove(testDir);
    });
    
    test('should detect repository with Frigg dependencies', async () => {
        await fs.writeJson(path.join(testDir, 'package.json'), {
            name: 'test-frigg-app',
            dependencies: {
                '@friggframework/core': '^1.0.0'
            }
        });
        
        const result = await isFriggRepository(testDir);
        expect(result.isFriggRepo).toBe(true);
        expect(result.repoInfo.friggDependencies).toContain('@friggframework/core');
    });
    
    test('should NOT detect Zapier app without Frigg dependencies', async () => {
        await fs.writeJson(path.join(testDir, 'package.json'), {
            name: 'autotask--zapier-public',
            scripts: {
                zapier: 'zapier'
            },
            dependencies: {
                'zapier-platform-core': '^11.0.0'
            }
        });
        
        const result = await isFriggRepository(testDir);
        expect(result.isFriggRepo).toBe(false);
    });
    
    test('should detect Zapier app WITH Frigg dependencies', async () => {
        await fs.writeJson(path.join(testDir, 'package.json'), {
            name: 'example--zapier-public',
            scripts: {
                zapier: 'zapier'
            },
            dependencies: {
                'zapier-platform-core': '^11.0.0',
                '@friggframework/zapier-adapter': '^1.0.0'
            }
        });
        
        const result = await isFriggRepository(testDir);
        expect(result.isFriggRepo).toBe(true);
        expect(result.repoInfo.isZapierApp).toBe(true);
    });
    
    test('should detect repository with Frigg config file', async () => {
        await fs.writeJson(path.join(testDir, 'package.json'), {
            name: 'test-app'
        });
        await fs.writeFile(path.join(testDir, 'frigg.config.js'), 'module.exports = {}');
        
        const result = await isFriggRepository(testDir);
        expect(result.isFriggRepo).toBe(true);
        expect(result.repoInfo.hasFriggConfig).toBe(true);
    });
    
    test('should detect repository with Frigg directories', async () => {
        await fs.writeJson(path.join(testDir, 'package.json'), {
            name: 'test-app'
        });
        await fs.ensureDir(path.join(testDir, 'api-modules'));
        
        const result = await isFriggRepository(testDir);
        expect(result.isFriggRepo).toBe(true);
        expect(result.repoInfo.hasFriggDirectories).toBe(true);
    });
    
    test('should detect repository with Frigg scripts', async () => {
        await fs.writeJson(path.join(testDir, 'package.json'), {
            name: 'test-app',
            scripts: {
                'dev': 'frigg start',
                'build': 'frigg build'
            }
        });
        
        const result = await isFriggRepository(testDir);
        expect(result.isFriggRepo).toBe(true);
        expect(result.repoInfo.hasFriggScripts).toBe(true);
    });
    
    test('should NOT detect regular Node.js app without Frigg indicators', async () => {
        await fs.writeJson(path.join(testDir, 'package.json'), {
            name: 'regular-node-app',
            dependencies: {
                'express': '^4.0.0'
            }
        });
        
        const result = await isFriggRepository(testDir);
        expect(result.isFriggRepo).toBe(false);
    });
});