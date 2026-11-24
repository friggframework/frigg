const { queueArnFromUrl } = require('./sqs-queue-arn');

const ACCOUNT = '123456789012';
const NAME = 'acme-salesforce';
const subArn = (region) => ({
    'Fn::Sub': `arn:\${AWS::Partition}:sqs:${region}:${ACCOUNT}:${NAME}`,
});

describe('queueArnFromUrl', () => {
    it.each([
        [
            'a regional endpoint',
            `https://sqs.eu-west-1.amazonaws.com`,
            'eu-west-1',
        ],
        [
            'a China endpoint',
            `https://sqs.cn-north-1.amazonaws.com.cn`,
            'cn-north-1',
        ],
        [
            'a legacy regional endpoint',
            `https://eu-west-1.queue.amazonaws.com`,
            'eu-west-1',
        ],
        [
            'the legacy us-east-1 endpoint',
            `https://queue.amazonaws.com`,
            'us-east-1',
        ],
    ])(
        'reads the region of %s and leaves the partition to the stack',
        (_label, origin, region) => {
            expect(queueArnFromUrl(`${origin}/${ACCOUNT}/${NAME}`)).toEqual(
                subArn(region)
            );
        }
    );

    it('uses the stack region for a host it does not know', () => {
        expect(
            queueArnFromUrl(`https://sqs.internal.example/${ACCOUNT}/${NAME}`)
        ).toEqual(subArn('${AWS::Region}'));
    });

    it.each([
        ['a Serverless variable', '${ssm:/acme/queue-url}'],
        ['a CloudFormation function', { 'Fn::ImportValue': 'AcmeQueueUrl' }],
    ])(
        'splits %s in CloudFormation, because it resolves after the build',
        (_label, queueUrl) => {
            const part = (index) => ({
                'Fn::Select': [index, { 'Fn::Split': ['/', queueUrl] }],
            });
            expect(queueArnFromUrl(queueUrl)).toEqual({
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
            });
        }
    );
});
