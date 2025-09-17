/**
 * AWS SSM Parameter Store Lambda Extension Layer ARNs by region
 * Version: Latest as of 2025
 * 
 * These ARNs provide the AWS Parameters and Secrets Lambda Extension
 * which enables efficient parameter retrieval with caching
 * 
 * Documentation: https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html
 */

const SSM_LAYER_ARNS = {
    // US Regions
    'us-east-1': {
        x86_64: 'arn:aws:lambda:us-east-1:177933569100:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:us-east-1:177933569100:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'us-east-2': {
        x86_64: 'arn:aws:lambda:us-east-2:590474943231:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:us-east-2:590474943231:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'us-west-1': {
        x86_64: 'arn:aws:lambda:us-west-1:997803712105:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:us-west-1:997803712105:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'us-west-2': {
        x86_64: 'arn:aws:lambda:us-west-2:345057560386:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:us-west-2:345057560386:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    
    // Europe Regions
    'eu-west-1': {
        x86_64: 'arn:aws:lambda:eu-west-1:015030872274:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:eu-west-1:015030872274:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'eu-west-2': {
        x86_64: 'arn:aws:lambda:eu-west-2:133256977650:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:eu-west-2:133256977650:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'eu-west-3': {
        x86_64: 'arn:aws:lambda:eu-west-3:659544348971:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:eu-west-3:659544348971:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'eu-central-1': {
        x86_64: 'arn:aws:lambda:eu-central-1:187925254637:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:eu-central-1:187925254637:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'eu-north-1': {
        x86_64: 'arn:aws:lambda:eu-north-1:427196147048:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:eu-north-1:427196147048:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'eu-south-1': {
        x86_64: 'arn:aws:lambda:eu-south-1:325218067255:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:eu-south-1:325218067255:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    
    // Asia Pacific Regions
    'ap-southeast-1': {
        x86_64: 'arn:aws:lambda:ap-southeast-1:044395824272:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:ap-southeast-1:044395824272:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'ap-southeast-2': {
        x86_64: 'arn:aws:lambda:ap-southeast-2:665172237481:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:ap-southeast-2:665172237481:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'ap-northeast-1': {
        x86_64: 'arn:aws:lambda:ap-northeast-1:133490724326:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:ap-northeast-1:133490724326:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'ap-northeast-2': {
        x86_64: 'arn:aws:lambda:ap-northeast-2:738900069198:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:ap-northeast-2:738900069198:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'ap-south-1': {
        x86_64: 'arn:aws:lambda:ap-south-1:176022468876:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:ap-south-1:176022468876:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    
    // Other Regions
    'ca-central-1': {
        x86_64: 'arn:aws:lambda:ca-central-1:200266452380:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:ca-central-1:200266452380:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'sa-east-1': {
        x86_64: 'arn:aws:lambda:sa-east-1:933737806257:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:sa-east-1:933737806257:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'af-south-1': {
        x86_64: 'arn:aws:lambda:af-south-1:317013901791:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:af-south-1:317013901791:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    },
    'me-south-1': {
        x86_64: 'arn:aws:lambda:me-south-1:832021897121:layer:AWS-Parameters-and-Secrets-Lambda-Extension:19',
        arm64: 'arn:aws:lambda:me-south-1:832021897121:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:19'
    }
};

/**
 * Get the SSM Lambda Extension layer ARN for a specific region and architecture
 * @param {string} region - AWS region
 * @param {string} [architecture='x86_64'] - Lambda architecture (x86_64 or arm64)
 * @returns {string|null} The layer ARN or null if not found
 */
function getSSMLayerArn(region, architecture = 'x86_64') {
    const regionArns = SSM_LAYER_ARNS[region];
    if (!regionArns) {
        console.warn(`SSM Layer ARN not found for region: ${region}`);
        return null;
    }
    
    const arn = regionArns[architecture];
    if (!arn) {
        console.warn(`SSM Layer ARN not found for architecture ${architecture} in region ${region}`);
        return null;
    }
    
    return arn;
}

/**
 * Check if a region is supported for SSM Lambda Extension
 * @param {string} region - AWS region
 * @returns {boolean} True if the region is supported
 */
function isRegionSupported(region) {
    return SSM_LAYER_ARNS.hasOwnProperty(region);
}

/**
 * Get all supported regions
 * @returns {string[]} Array of supported region codes
 */
function getSupportedRegions() {
    return Object.keys(SSM_LAYER_ARNS);
}

module.exports = {
    SSM_LAYER_ARNS,
    getSSMLayerArn,
    isRegionSupported,
    getSupportedRegions
};