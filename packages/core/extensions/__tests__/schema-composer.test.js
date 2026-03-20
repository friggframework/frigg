const fs = require('fs');
const path = require('path');
const os = require('os');
const { composeSchemas, extractModelBlocks } = require('../schema-composer');

describe('Schema Composer', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-schema-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('extractModelBlocks', () => {
        it('should extract model definitions from a schema', () => {
            const schema = `
generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma-postgresql"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int    @id @default(autoincrement())
  name  String
}

model Post {
  id    Int    @id @default(autoincrement())
  title String
}
`;
            const result = extractModelBlocks(schema);
            expect(result).toContain('model User');
            expect(result).toContain('model Post');
            expect(result).not.toContain('generator');
            expect(result).not.toContain('datasource');
        });

        it('should extract enum definitions', () => {
            const schema = `
generator client {
  provider = "prisma-client-js"
}

enum Role {
  USER
  ADMIN
}
`;
            const result = extractModelBlocks(schema);
            expect(result).toContain('enum Role');
            expect(result).toContain('USER');
            expect(result).toContain('ADMIN');
            expect(result).not.toContain('generator');
        });

        it('should handle schema with only models (no generator/datasource)', () => {
            const schema = `
model OAuthAppCredential {
  id          Int    @id @default(autoincrement())
  moduleType  String
  clientId    String
  clientSecret String
}
`;
            const result = extractModelBlocks(schema);
            expect(result).toContain('model OAuthAppCredential');
            expect(result).toContain('moduleType');
        });

        it('should return empty string for schema with no models', () => {
            const schema = `
generator client {
  provider = "prisma-client-js"
}
`;
            const result = extractModelBlocks(schema);
            expect(result).toBe('');
        });
    });

    describe('composeSchemas', () => {
        it('should return base schema when no extensions', () => {
            const basePath = path.join(tmpDir, 'base.prisma');
            fs.writeFileSync(
                basePath,
                'generator client {\n  provider = "prisma-client-js"\n}\n\nmodel User {\n  id Int @id\n}'
            );

            const result = composeSchemas({
                baseSchemaPath: basePath,
                extensionSchemaPaths: [],
            });

            expect(result).toContain('model User');
            expect(result).toContain('generator client');
        });

        it('should merge extension models into base schema', () => {
            const basePath = path.join(tmpDir, 'base.prisma');
            fs.writeFileSync(
                basePath,
                'generator client {\n  provider = "prisma-client-js"\n}\n\nmodel User {\n  id Int @id\n}'
            );

            const extDir = path.join(tmpDir, 'ext');
            fs.mkdirSync(extDir);
            const extPath = path.join(extDir, 'credential.prisma');
            fs.writeFileSync(
                extPath,
                'model OAuthAppCredential {\n  id Int @id\n  clientId String\n  clientSecret String\n}'
            );

            const outputPath = path.join(tmpDir, 'merged.prisma');
            const result = composeSchemas({
                baseSchemaPath: basePath,
                extensionSchemaPaths: [extPath],
                outputPath,
            });

            expect(result).toContain('model User');
            expect(result).toContain('model OAuthAppCredential');
            expect(result).toContain('Extension Models');

            // Check file was written
            const written = fs.readFileSync(outputPath, 'utf-8');
            expect(written).toBe(result);
        });

        it('should strip generator/datasource from extension schemas', () => {
            const basePath = path.join(tmpDir, 'base.prisma');
            fs.writeFileSync(
                basePath,
                'generator client {\n  provider = "prisma-client-js"\n}\n\nmodel User {\n  id Int @id\n}'
            );

            const extPath = path.join(tmpDir, 'ext.prisma');
            fs.writeFileSync(
                extPath,
                'generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n}\n\nmodel Token {\n  id Int @id\n}'
            );

            const result = composeSchemas({
                baseSchemaPath: basePath,
                extensionSchemaPaths: [extPath],
            });

            // Base generator should exist, extension's should be stripped
            const generatorCount = (result.match(/generator client/g) || [])
                .length;
            expect(generatorCount).toBe(1);
            expect(result).toContain('model Token');
        });

        it('should throw when extension schema file not found', () => {
            const basePath = path.join(tmpDir, 'base.prisma');
            fs.writeFileSync(basePath, 'model User { id Int @id }');

            expect(() =>
                composeSchemas({
                    baseSchemaPath: basePath,
                    extensionSchemaPaths: ['/nonexistent/schema.prisma'],
                })
            ).toThrow('Extension schema not found');
        });

        it('should throw when baseSchemaPath is not provided', () => {
            expect(() => composeSchemas({})).toThrow('baseSchemaPath is required');
        });

        it('should compose multiple extension schemas', () => {
            const basePath = path.join(tmpDir, 'base.prisma');
            fs.writeFileSync(basePath, 'model User {\n  id Int @id\n}');

            const ext1Path = path.join(tmpDir, 'ext1.prisma');
            fs.writeFileSync(ext1Path, 'model Credential {\n  id Int @id\n}');

            const ext2Path = path.join(tmpDir, 'ext2.prisma');
            fs.writeFileSync(ext2Path, 'model AuditLog {\n  id Int @id\n}');

            const result = composeSchemas({
                baseSchemaPath: basePath,
                extensionSchemaPaths: [ext1Path, ext2Path],
            });

            expect(result).toContain('model User');
            expect(result).toContain('model Credential');
            expect(result).toContain('model AuditLog');
        });
    });
});
