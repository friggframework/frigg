/**
 * Test suite for generate-iam command
 *
 * Drives generateIamCommand end-to-end (real getFeatureSummary +
 * generateIAMCloudFormation) to verify appDefinition.ssm.kmsKeyArn
 * actually reaches the generated CloudFormation template. A unit test
 * that hand-supplies ssmKmsKeyArn straight to generateIAMCloudFormation
 * would not catch a caller that forgets to thread it through.
 */

jest.mock('fs-extra');
jest.mock('@friggframework/core', () => ({
    findNearestBackendPackageJson: jest.fn()
}));

const path = require('path');
const fs = require('fs-extra');
const { findNearestBackendPackageJson } = require('@friggframework/core');
const { generateIamCommand } = require('../../../generate-iam-command');

describe('CLI Command: generate-iam', () => {
    const mockBackendPath = '/mock/backend/package.json';
    const mockBackendDir = '/mock/backend';
    const mockAppDefinitionPath = path.join(mockBackendDir, 'index.js');

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        jest.spyOn(process, 'exit').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        findNearestBackendPackageJson.mockReturnValue(mockBackendPath);

        fs.existsSync = jest.fn().mockReturnValue(true);
        fs.ensureDir = jest.fn().mockResolvedValue();
        fs.writeFile = jest.fn().mockResolvedValue();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.dontMock(mockAppDefinitionPath);
    });

    it('scopes the SSM-mediated KMS grant to ssm.kmsKeyArn when configured', async () => {
        const mockAppDefinition = {
            name: 'test-app',
            ssm: {
                enable: true,
                kmsKeyArn:
                    'arn:aws:kms:us-east-1:123456789012:key/abcd-1234'
            }
        };

        jest.doMock(
            mockAppDefinitionPath,
            () => ({ Definition: mockAppDefinition }),
            { virtual: true }
        );

        await generateIamCommand({});

        expect(fs.writeFile).toHaveBeenCalled();
        const [, generatedYaml] = fs.writeFile.mock.calls[0];

        expect(generatedYaml).toContain('FriggSSMParameterKMSEncryption');
        expect(generatedYaml).toContain(
            'arn:aws:kms:us-east-1:123456789012:key/abcd-1234'
        );
        expect(generatedYaml).not.toContain(
            'arn:aws:kms:*:${AWS::AccountId}:key/*'
        );
    });

    it('falls back to the account-wide KMS wildcard when ssm.kmsKeyArn is not set', async () => {
        const mockAppDefinition = {
            name: 'test-app',
            ssm: { enable: true }
        };

        jest.doMock(
            mockAppDefinitionPath,
            () => ({ Definition: mockAppDefinition }),
            { virtual: true }
        );

        await generateIamCommand({});

        expect(fs.writeFile).toHaveBeenCalled();
        const [, generatedYaml] = fs.writeFile.mock.calls[0];

        expect(generatedYaml).toContain(
            'arn:aws:kms:*:${AWS::AccountId}:key/*'
        );
    });
});
