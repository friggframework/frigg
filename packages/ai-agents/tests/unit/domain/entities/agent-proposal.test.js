const { AgentProposal, ProposalStatus } = require('../../../../src/domain/entities/agent-proposal');

describe('AgentProposal Entity', () => {
    describe('proposal status', () => {
        it('should define all required statuses', () => {
            expect(ProposalStatus.PENDING).toBe('pending');
            expect(ProposalStatus.APPROVED).toBe('approved');
            expect(ProposalStatus.REJECTED).toBe('rejected');
            expect(ProposalStatus.MODIFIED).toBe('modified');
        });
    });

    describe('AgentProposal creation', () => {
        it('should create proposal with files', () => {
            const files = [
                { path: 'src/integrations/hubspot.js', content: '...', action: 'create' },
                { path: 'tests/hubspot.test.js', content: '...', action: 'create' }
            ];

            const proposal = new AgentProposal({
                id: 'proposal-123',
                files,
                validation: { confidence: 92, recommendation: 'require_review' }
            });

            expect(proposal.id).toBe('proposal-123');
            expect(proposal.files).toHaveLength(2);
            expect(proposal.status).toBe(ProposalStatus.PENDING);
            expect(proposal.validation.confidence).toBe(92);
        });

        it('should calculate summary statistics', () => {
            const files = [
                { path: 'src/a.js', content: 'line1\nline2\nline3', action: 'create' },
                { path: 'src/b.js', content: 'line1\nline2', action: 'create' },
                { path: 'src/c.js', content: '', action: 'modify', diff: '+5 -2' }
            ];

            const proposal = new AgentProposal({ id: 'test', files, validation: {} });
            const summary = proposal.getSummary();

            expect(summary.fileCount).toBe(3);
            expect(summary.createdFiles).toBe(2);
            expect(summary.modifiedFiles).toBe(1);
        });
    });

    describe('approval workflow', () => {
        it('should approve proposal', () => {
            const proposal = new AgentProposal({
                id: 'test',
                files: [],
                validation: { confidence: 95 }
            });

            proposal.approve();

            expect(proposal.status).toBe(ProposalStatus.APPROVED);
            expect(proposal.approvedAt).toBeInstanceOf(Date);
        });

        it('should reject proposal with feedback', () => {
            const proposal = new AgentProposal({
                id: 'test',
                files: [],
                validation: { confidence: 70 }
            });

            proposal.reject('Missing error handling');

            expect(proposal.status).toBe(ProposalStatus.REJECTED);
            expect(proposal.rejectionReason).toBe('Missing error handling');
        });

        it('should not allow approval of already rejected proposal', () => {
            const proposal = new AgentProposal({
                id: 'test',
                files: [],
                validation: { confidence: 70 }
            });

            proposal.reject('Rejected');

            expect(() => proposal.approve()).toThrow('Cannot approve rejected proposal');
        });
    });

    describe('git checkpoint', () => {
        it('should store checkpoint reference', () => {
            const proposal = new AgentProposal({
                id: 'test',
                files: [],
                validation: {},
                checkpointId: 'abc123'
            });

            expect(proposal.checkpointId).toBe('abc123');
        });

        it('should support rollback', () => {
            const proposal = new AgentProposal({
                id: 'test',
                files: [],
                validation: {},
                checkpointId: 'abc123'
            });

            expect(proposal.canRollback()).toBe(true);
        });

        it('should not support rollback without checkpoint', () => {
            const proposal = new AgentProposal({
                id: 'test',
                files: [],
                validation: {}
            });

            expect(proposal.canRollback()).toBe(false);
        });
    });
});
