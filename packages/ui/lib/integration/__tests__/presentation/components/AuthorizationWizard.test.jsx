/**
 * @file AuthorizationWizard Tests
 * @description Comprehensive tests for the AuthorizationWizard component
 * 
 * Tests both single-step and multi-step authentication flows
 * Verifies integration with new v2 API endpoints
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthorizationWizard } from '../../presentation/components/AuthorizationWizard';

// Mock the Form component
jest.mock('../../Form', () => ({
    Form: ({ schema, uiSchema, data, onChange }) => (
        <div data-testid="form-component">
            <input
                data-testid="form-input"
                value={data?.email || ''}
                onChange={(e) => onChange({ data: { email: e.target.value } })}
                placeholder="Enter email"
            />
        </div>
    )
}));

describe('AuthorizationWizard', () => {
    let mockApi;
    let mockOnSuccess;
    let mockOnCancel;
    let mockOnError;

    beforeEach(() => {
        mockApi = {
            getModuleAuthorizationRequirements: jest.fn(),
            submitModuleAuthorization: jest.fn()
        };
        mockOnSuccess = jest.fn();
        mockOnCancel = jest.fn();
        mockOnError = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Single-Step Authentication', () => {
        it('should render form-based auth for single-step flow', async () => {
            const requirements = {
                type: 'form',
                step: 1,
                totalSteps: 1,
                isMultiStep: false,
                data: {
                    jsonSchema: {
                        title: 'Connect Service',
                        type: 'object',
                        required: ['email'],
                        properties: {
                            email: {
                                type: 'string',
                                format: 'email',
                                title: 'Email Address'
                            }
                        }
                    },
                    uiSchema: {
                        email: {
                            'ui:placeholder': 'your.email@company.com'
                        }
                    }
                }
            };

            mockApi.getModuleAuthorizationRequirements.mockResolvedValue(requirements);

            render(
                <AuthorizationWizard
                    api={mockApi}
                    moduleType="test-service"
                    onSuccess={mockOnSuccess}
                    onCancel={mockOnCancel}
                    onError={mockOnError}
                />
            );

            await waitFor(() => {
                expect(screen.getByText('Connect Service')).toBeInTheDocument();
            });

            expect(screen.getByTestId('form-component')).toBeInTheDocument();
            expect(screen.getByText('Complete')).toBeInTheDocument();
            expect(screen.queryByText(/Step \d+ of \d+/)).not.toBeInTheDocument();
        });

        it('should handle single-step form submission successfully', async () => {
            const requirements = {
                type: 'form',
                step: 1,
                totalSteps: 1,
                isMultiStep: false,
                data: {
                    jsonSchema: {
                        title: 'Connect Service',
                        type: 'object',
                        required: ['email'],
                        properties: {
                            email: {
                                type: 'string',
                                format: 'email',
                                title: 'Email Address'
                            }
                        }
                    }
                }
            };

            const successResult = {
                entity: {
                    id: 'entity-123',
                    name: 'Test Entity',
                    moduleType: 'test-service'
                }
            };

            mockApi.getModuleAuthorizationRequirements.mockResolvedValue(requirements);
            mockApi.submitModuleAuthorization.mockResolvedValue(successResult);

            render(
                <AuthorizationWizard
                    api={mockApi}
                    moduleType="test-service"
                    onSuccess={mockOnSuccess}
                    onCancel={mockOnCancel}
                    onError={mockOnError}
                />
            );

            await waitFor(() => {
                expect(screen.getByTestId('form-input')).toBeInTheDocument();
            });

            // Fill form
            fireEvent.change(screen.getByTestId('form-input'), {
                target: { value: 'test@example.com' }
            });

            // Submit form
            fireEvent.click(screen.getByText('Complete'));

            await waitFor(() => {
                expect(mockApi.submitModuleAuthorization).toHaveBeenCalledWith(
                    'test-service',
                    { email: 'test@example.com' },
                    1,
                    null
                );
            });

            expect(mockOnSuccess).toHaveBeenCalledWith(successResult);
        });
    });

    describe('Multi-Step Authentication', () => {
        it('should render multi-step form with progress bar', async () => {
            const requirements = {
                type: 'form',
                step: 1,
                totalSteps: 2,
                isMultiStep: true,
                sessionId: 'session-123',
                data: {
                    jsonSchema: {
                        title: 'Step 1: Email',
                        type: 'object',
                        required: ['email'],
                        properties: {
                            email: {
                                type: 'string',
                                format: 'email',
                                title: 'Email Address'
                            }
                        }
                    }
                }
            };

            mockApi.getModuleAuthorizationRequirements.mockResolvedValue(requirements);

            render(
                <AuthorizationWizard
                    api={mockApi}
                    moduleType="multi-step-service"
                    onSuccess={mockOnSuccess}
                    onCancel={mockOnCancel}
                    onError={mockOnError}
                />
            );

            await waitFor(() => {
                expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
            });

            expect(screen.getByText('50%')).toBeInTheDocument();
            expect(screen.getByText('Continue')).toBeInTheDocument();
        });
    });

    describe('Error Handling', () => {
        it('should display error message when API call fails', async () => {
            const error = new Error('Network error');
            mockApi.getModuleAuthorizationRequirements.mockRejectedValue(error);

            render(
                <AuthorizationWizard
                    api={mockApi}
                    moduleType="error-service"
                    onSuccess={mockOnSuccess}
                    onCancel={mockOnCancel}
                    onError={mockOnError}
                />
            );

            await waitFor(() => {
                expect(screen.getByText('Authentication Error')).toBeInTheDocument();
            });

            expect(screen.getByText('Network error')).toBeInTheDocument();
            expect(screen.getByText('Retry')).toBeInTheDocument();
            expect(mockOnError).toHaveBeenCalledWith('Network error');
        });
    });
});
