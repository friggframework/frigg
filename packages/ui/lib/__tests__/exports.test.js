/**
 * Package Export Verification Tests
 *
 * Ensures all expected exports are available from @friggframework/ui.
 * These tests catch broken exports before they reach consumers.
 *
 * TDD: Add new exports here FIRST, then implement.
 */

import { describe, it, expect } from 'vitest';
import * as uiExports from '../index.js';

describe('@friggframework/ui exports', () => {
    describe('Core UI Components', () => {
        it('exports Button', () => {
            expect(uiExports.Button).toBeDefined();
        });

        it('exports Input', () => {
            expect(uiExports.Input).toBeDefined();
        });

        it('exports LoadingSpinner', () => {
            expect(uiExports.LoadingSpinner).toBeDefined();
        });
    });

    describe('Integration Layout Components', () => {
        it('exports IntegrationHorizontal', () => {
            expect(uiExports.IntegrationHorizontal).toBeDefined();
        });

        it('exports IntegrationVertical', () => {
            expect(uiExports.IntegrationVertical).toBeDefined();
        });

        it('exports IntegrationList', () => {
            expect(uiExports.IntegrationList).toBeDefined();
        });
    });

    describe('Integration Feature Components', () => {
        it('exports RedirectFromAuth', () => {
            expect(uiExports.RedirectFromAuth).toBeDefined();
        });

        it('exports UserActionModal', () => {
            expect(uiExports.UserActionModal).toBeDefined();
        });

        it('exports IntegrationHub', () => {
            expect(uiExports.IntegrationHub).toBeDefined();
        });

        it('exports IntegrationTabs', () => {
            expect(uiExports.IntegrationTabs).toBeDefined();
        });

        it('exports EntityManager', () => {
            expect(uiExports.EntityManager).toBeDefined();
        });

        it('exports IntegrationBuilder', () => {
            expect(uiExports.IntegrationBuilder).toBeDefined();
        });

        it('exports AuthModal', () => {
            expect(uiExports.AuthModal).toBeDefined();
        });
    });

    describe('Testing Components', () => {
        it('exports UserActionTester', () => {
            expect(uiExports.UserActionTester).toBeDefined();
        });

        it('exports SystemActionsTester', () => {
            expect(uiExports.SystemActionsTester).toBeDefined();
        });

        it('exports TestingDashboard', () => {
            expect(uiExports.TestingDashboard).toBeDefined();
        });

        it('exports TestingDemo', () => {
            expect(uiExports.TestingDemo).toBeDefined();
        });
    });

    describe('Context and Hooks', () => {
        it('exports FriggProvider', () => {
            expect(uiExports.FriggProvider).toBeDefined();
        });

        it('exports useFrigg hook', () => {
            expect(uiExports.useFrigg).toBeDefined();
            expect(typeof uiExports.useFrigg).toBe('function');
        });

        it('exports useIntegrationData hook', () => {
            expect(uiExports.useIntegrationData).toBeDefined();
            expect(typeof uiExports.useIntegrationData).toBe('function');
        });
    });

    describe('Export completeness', () => {
        it('has all expected exports', () => {
            const expectedExports = [
                // Core UI
                'Button',
                'Input',
                'LoadingSpinner',
                // Integration Layouts
                'IntegrationHorizontal',
                'IntegrationVertical',
                'IntegrationList',
                // Integration Features
                'RedirectFromAuth',
                'UserActionModal',
                'IntegrationHub',
                'IntegrationTabs',
                'EntityManager',
                'IntegrationBuilder',
                'AuthModal',
                // Testing
                'UserActionTester',
                'SystemActionsTester',
                'TestingDashboard',
                'TestingDemo',
                // Context/Hooks
                'FriggProvider',
                'useFrigg',
                'useIntegrationData',
            ];

            const missingExports = expectedExports.filter(
                name => !(name in uiExports)
            );

            expect(missingExports).toEqual([]);
        });
    });
});
