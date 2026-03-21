/**
 * KMS Health Check (AWS-specific)
 *
 * Extracted from health.js router — tests KMS decrypt capability
 * including VPC detection, DNS resolution, and TCP connectivity.
 *
 * This is deeply AWS-specific and belongs in the provider-aws package.
 */

/**
 * Detect VPC configuration by testing network connectivity
 * @returns {Promise<Object>} VPC configuration details
 */
async function detectVpcConfiguration() {
    const results = {
        isInVpc: false,
        hasInternetAccess: false,
        canResolvePublicDns: false,
        canConnectToAws: false,
        vpcEndpoints: [],
    };

    try {
        const dns = require('dns').promises;

        // Test 1: Can we resolve public DNS?
        try {
            await Promise.race([
                dns.resolve4('www.google.com'),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 2000)
                ),
            ]);
            results.canResolvePublicDns = true;
        } catch (e) {
            console.log('Public DNS resolution failed:', e.message);
        }

        // Test 2: Can we reach internet? (indicates NAT gateway)
        try {
            const https = require('https');
            await new Promise((resolve, reject) => {
                const req = https.get(
                    'https://www.google.com',
                    { timeout: 2000 },
                    (res) => {
                        res.destroy();
                        resolve(true);
                    }
                );
                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('timeout'));
                });
            });
            results.hasInternetAccess = true;
        } catch (e) {
            console.log('Internet connectivity test failed:', e.message);
        }

        // Test 3: Check for VPC endpoints
        const region = process.env.AWS_REGION;
        const vpcEndpointDomains = [
            `com.amazonaws.${region}.kms`,
            `com.amazonaws.vpce.${region}`,
            `kms.${region}.amazonaws.com`,
        ];

        for (const domain of vpcEndpointDomains) {
            try {
                const addresses = await Promise.race([
                    dns.resolve4(domain).catch(() => dns.resolve6(domain)),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), 1000)
                    ),
                ]);
                if (addresses && addresses.length > 0) {
                    const isPrivateIp = addresses.some(
                        (ip) =>
                            ip.startsWith('10.') ||
                            ip.startsWith('172.') ||
                            ip.startsWith('192.168.')
                    );
                    if (isPrivateIp) {
                        results.vpcEndpoints.push(domain);
                    }
                }
            } catch (e) {
                // Expected for non-existent endpoints
            }
        }

        results.isInVpc =
            process.env.VPC_ENABLED === 'true' ||
            (!results.hasInternetAccess && results.canResolvePublicDns) ||
            results.vpcEndpoints.length > 0;

        results.canConnectToAws =
            results.hasInternetAccess || results.vpcEndpoints.length > 0;
    } catch (error) {
        console.error('VPC detection error:', error.message);
    }

    return results;
}

/**
 * Check KMS decrypt capability
 *
 * Tests DNS resolution, TCP connectivity, and actual KMS operations
 * to verify the AWS KMS service is accessible and functional.
 *
 * @returns {Promise<Object>} Health check result with status, latency, and VPC info
 */
async function checkKmsDecryptCapability() {
    const start = Date.now();
    const { KMS_KEY_ARN } = process.env;
    if (!KMS_KEY_ARN) {
        return {
            status: 'skipped',
            reason: 'KMS_KEY_ARN not configured',
        };
    }

    console.log('KMS Check Debug:', {
        hasKmsKeyArn: !!KMS_KEY_ARN,
        kmsKeyArnPrefix: KMS_KEY_ARN?.substring(0, 30),
        awsRegion: process.env.AWS_REGION,
        hasDiscoveryKey: !!process.env.AWS_DISCOVERY_KMS_KEY_ID,
    });

    const vpcConfig = await detectVpcConfiguration();
    console.log('VPC Configuration:', vpcConfig);

    // Test DNS resolution for KMS endpoint
    try {
        const dns = require('dns').promises;
        const region = process.env.AWS_REGION;
        const kmsEndpoint = `kms.${region}.amazonaws.com`;
        console.log('Testing DNS resolution for:', kmsEndpoint);

        const dnsPromise = dns.resolve4(kmsEndpoint);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('DNS resolution timeout')), 3000)
        );

        const addresses = await Promise.race([dnsPromise, timeoutPromise]);
        console.log('KMS endpoint resolved to:', addresses);

        const isVpcEndpoint = addresses.some(
            (ip) =>
                ip.startsWith('10.') ||
                ip.startsWith('172.') ||
                ip.startsWith('192.168.')
        );

        if (isVpcEndpoint) {
            console.log(
                'KMS VPC Endpoint detected - using private connectivity'
            );
        }

        // Test TCP connectivity to KMS (port 443)
        const net = require('net');
        const testConnection = () =>
            new Promise((resolve) => {
                const socket = new net.Socket();
                const connectionTimeout = setTimeout(() => {
                    socket.destroy();
                    resolve({ connected: false, error: 'Connection timeout' });
                }, 3000);

                socket.on('connect', () => {
                    clearTimeout(connectionTimeout);
                    socket.destroy();
                    resolve({ connected: true });
                });

                socket.on('error', (err) => {
                    clearTimeout(connectionTimeout);
                    resolve({ connected: false, error: err.message });
                });

                socket.connect(443, addresses[0]);
            });

        const connResult = await testConnection();
        console.log('TCP connectivity test:', connResult);

        if (!connResult.connected) {
            return {
                status: 'unhealthy',
                error: `Cannot connect to KMS endpoint: ${connResult.error}`,
                dnsResolved: true,
                tcpConnection: false,
                vpcConfig,
                latencyMs: Date.now() - start,
            };
        }
    } catch (dnsError) {
        console.error('DNS resolution failed:', dnsError.message);
        return {
            status: 'unhealthy',
            error: `Cannot resolve KMS endpoint: ${dnsError.message}`,
            dnsResolved: false,
            vpcConfig,
            latencyMs: Date.now() - start,
        };
    }

    try {
        const {
            KMSClient,
            GenerateDataKeyCommand,
            DecryptCommand,
        } = require('@aws-sdk/client-kms');

        const region = process.env.AWS_REGION;

        const kms = new KMSClient({
            region,
            requestHandler: {
                connectionTimeout: 10000,
                requestTimeout: 25000,
            },
            maxAttempts: 1,
        });

        const dataKeyResp = await kms.send(
            new GenerateDataKeyCommand({
                KeyId: KMS_KEY_ARN,
                KeySpec: 'AES_256',
            })
        );
        const decryptResp = await kms.send(
            new DecryptCommand({ CiphertextBlob: dataKeyResp.CiphertextBlob })
        );

        const success = Boolean(
            dataKeyResp.CiphertextBlob && decryptResp.Plaintext
        );

        return {
            status: success ? 'healthy' : 'unhealthy',
            kmsKeyArnSuffix: KMS_KEY_ARN.slice(-12),
            vpcConfig,
            latencyMs: Date.now() - start,
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message,
            vpcConfig,
            latencyMs: Date.now() - start,
        };
    }
}

module.exports = { checkKmsDecryptCapability, detectVpcConfiguration };
