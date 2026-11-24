const LEGACY_US_EAST_1_HOST = 'queue.amazonaws.com';
const AWS_DOMAIN = /\.amazonaws\.com(\.cn)?$/;

function regionOfQueueHost(hostname) {
    if (hostname === LEGACY_US_EAST_1_HOST) return 'us-east-1';
    if (!AWS_DOMAIN.test(hostname)) return '${AWS::Region}';
    const labels = hostname.split('.');
    const sqsAt = labels.indexOf('sqs');
    if (sqsAt !== -1 && labels[sqsAt + 1]) return labels[sqsAt + 1];
    if (labels[1] === 'queue') return labels[0];
    return '${AWS::Region}';
}

function parseQueueUrl(queueUrl) {
    if (typeof queueUrl !== 'string') return null;
    try {
        const { hostname, pathname } = new URL(queueUrl);
        const [accountId, queueName] = pathname.split('/').filter(Boolean);
        return accountId && queueName
            ? { hostname, accountId, queueName }
            : null;
    } catch {
        return null;
    }
}

/**
 * The ARN of the SQS queue at `queueUrl`, for an IAM policy. The partition is
 * always the stack's. A value that is not a URL yet (a Serverless variable or
 * a CloudFormation function) resolves after the build, so CloudFormation
 * splits it, in the stack's region.
 */
function queueArnFromUrl(queueUrl) {
    const parsed = parseQueueUrl(queueUrl);
    if (parsed) {
        const region = regionOfQueueHost(parsed.hostname);
        return {
            'Fn::Sub': `arn:\${AWS::Partition}:sqs:${region}:${parsed.accountId}:${parsed.queueName}`,
        };
    }
    const part = (index) => ({
        'Fn::Select': [index, { 'Fn::Split': ['/', queueUrl] }],
    });
    return {
        'Fn::Join': [
            ':',
            [
                'arn',
                { Ref: 'AWS::Partition' },
                'sqs',
                { Ref: 'AWS::Region' },
                part(3),
                part(4),
            ],
        ],
    };
}

module.exports = { queueArnFromUrl };
