const ProposalStatus = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    MODIFIED: 'modified'
};

class AgentProposal {
    constructor({ id, files, validation, checkpointId = null }) {
        this.id = id;
        this.files = files;
        this.validation = validation;
        this.checkpointId = checkpointId;
        this.status = ProposalStatus.PENDING;
        this.createdAt = new Date();
        this.approvedAt = null;
        this.rejectedAt = null;
        this.rejectionReason = null;
    }

    getSummary() {
        let linesAdded = 0;
        let createdFiles = 0;
        let modifiedFiles = 0;

        for (const file of this.files) {
            if (file.action === 'create') {
                createdFiles++;
                if (file.content) {
                    linesAdded += file.content.split('\n').length;
                }
            } else if (file.action === 'modify') {
                modifiedFiles++;
            }
        }

        return {
            fileCount: this.files.length,
            createdFiles,
            modifiedFiles,
            linesAdded,
            confidence: this.validation?.confidence,
            recommendation: this.validation?.recommendation
        };
    }

    approve() {
        if (this.status === ProposalStatus.REJECTED) {
            throw new Error('Cannot approve rejected proposal');
        }
        this.status = ProposalStatus.APPROVED;
        this.approvedAt = new Date();
    }

    reject(reason) {
        this.status = ProposalStatus.REJECTED;
        this.rejectedAt = new Date();
        this.rejectionReason = reason;
    }

    canRollback() {
        return this.checkpointId !== null;
    }

    toJSON() {
        return {
            id: this.id,
            status: this.status,
            files: this.files.map(f => ({ path: f.path, action: f.action })),
            validation: this.validation,
            checkpointId: this.checkpointId,
            summary: this.getSummary(),
            createdAt: this.createdAt.toISOString(),
            approvedAt: this.approvedAt?.toISOString(),
            rejectedAt: this.rejectedAt?.toISOString(),
            rejectionReason: this.rejectionReason
        };
    }
}

module.exports = { AgentProposal, ProposalStatus };
