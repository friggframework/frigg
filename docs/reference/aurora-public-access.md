# Aurora Serverless v2 Public Access Configuration

## Overview

Aurora Serverless v2 supports public accessibility, allowing you to deploy your database on public subnets with whitelisted IP addresses. This is useful for:

- Development environments where you need direct database access
- Applications that need to connect from specific IP addresses
- Scenarios where VPC configuration is complex or not available

## Security Considerations

⚠️ **Important Security Notes:**
- Public accessibility should be used cautiously, especially in production
- Always configure IP whitelisting to restrict access
- Use strong passwords and consider additional security measures
- For production, private deployment within a VPC is generally recommended

## Configuration

### Basic Public Access Configuration

Add the following to your app definition:

```javascript
{
  database: {
    postgres: {
      enable: true,
      management: 'create-new',
      publiclyAccessible: true,
      allowedIpAddresses: [
        '203.0.113.10/32',      // Single IP address
        '198.51.100.0/24',      // IP range
      ],
      // Optional settings
      masterUsername: 'frigg_admin',
      databaseName: 'frigg_db',
      engineVersion: '15.3',
      scaling: {
        minCapacity: 0.5,
        maxCapacity: 1.0
      }
    }
  }
}
```

### Without VPC Configuration

For public access, you can omit VPC configuration if you're using the default VPC:

```javascript
{
  database: {
    postgres: {
      enable: true,
      publiclyAccessible: true,
      allowedIpAddresses: ['YOUR_IP_ADDRESS/32']
    }
  },
  // vpc section can be omitted
}
```

### With VPC Configuration (Recommended)

For better control, you can still configure VPC with public subnets:

```javascript
{
  vpc: {
    enable: true,
    management: 'discover'  // or 'create-new'
  },
  database: {
    postgres: {
      enable: true,
      publiclyAccessible: true,
      allowedIpAddresses: [
        '203.0.113.10/32'
      ]
    }
  }
}
```

## Configuration Options

### `publiclyAccessible` (boolean)
- **Default:** `false`
- **Description:** When set to `true`, the Aurora instance will be deployed in public subnets and assigned a public endpoint
- **Required for public access:** Yes

### `allowedIpAddresses` (string | string[])
- **Default:** `undefined`
- **Description:** IP addresses or CIDR blocks that are allowed to connect to the database
- **Format:** 
  - Single IP: `'203.0.113.10'` or `'203.0.113.10/32'`
  - IP range: `'198.51.100.0/24'`
  - Multiple IPs: `['203.0.113.10/32', '198.51.100.0/24']`
- **Notes:** 
  - If an IP doesn't have CIDR notation, `/32` is automatically appended
  - ⚠️ If `publiclyAccessible` is `true` but this is not set, a warning will be displayed

## How It Works

When you configure public access:

1. **Subnet Requirements:** Aurora requires a DB Subnet Group with at least 2 subnets in different availability zones (AWS requirement). The infrastructure will automatically:
   - Discover 2 existing public subnets in different AZs (if available)
   - Create 2 new public subnets in different AZs (if needed)
2. **Subnet Selection:** Aurora is deployed to these public subnets instead of private subnets
3. **Security Group:** A security group is created with ingress rules for:
   - Your whitelisted IP addresses (port 5432)
   - Lambda functions (if VPC is enabled)
4. **Public Endpoint:** The database instance gets a publicly accessible endpoint
5. **Connection:** You can connect directly from whitelisted IPs using standard PostgreSQL tools

## Examples

### Example 1: Development with Your Local IP

```javascript
{
  database: {
    postgres: {
      enable: true,
      management: 'create-new',
      publiclyAccessible: true,
      allowedIpAddresses: '73.XXX.XXX.XXX',  // Your home/office IP
      scaling: {
        minCapacity: 0.5,
        maxCapacity: 1.0
      }
    }
  }
}
```

### Example 2: Multiple Offices/Locations

```javascript
{
  database: {
    postgres: {
      enable: true,
      publiclyAccessible: true,
      allowedIpAddresses: [
        '203.0.113.10/32',    // Office 1
        '198.51.100.50/32',   // Office 2
        '192.0.2.0/24',       // VPN range
      ]
    }
  }
}
```

### Example 3: CI/CD Integration

```javascript
{
  database: {
    postgres: {
      enable: true,
      publiclyAccessible: true,
      allowedIpAddresses: [
        '140.82.112.0/20',    // GitHub Actions
        '185.199.108.0/22',   // GitHub Pages
        // Add your other CI/CD IP ranges
      ]
    }
  }
}
```

## Finding Your IP Address

To find your current IP address for whitelisting:

```bash
# Using curl
curl https://checkip.amazonaws.com

# Using dig
dig +short myip.opendns.com @resolver1.opendns.com

# Using an online service
# Visit: https://www.whatismyip.com/
```

## Deployment Behavior

### Subnet Selection Logic

The infrastructure automatically selects the appropriate subnets:

```
IF publiclyAccessible = true:
  USE public subnets (publicSubnetId1, publicSubnetId2)
ELSE:
  USE private subnets (privateSubnetId1, privateSubnetId2)
```

### Security Group Rules

Security group rules are built dynamically:

1. **Lambda Access** (if VPC is enabled):
   - Source: Lambda security group
   - Port: 5432
   - Protocol: TCP

2. **IP Whitelist** (if IPs are specified):
   - Source: Each whitelisted IP/CIDR
   - Port: 5432
   - Protocol: TCP

## Connecting to Your Database

Once deployed, you can connect using the public endpoint:

### Using psql

```bash
psql -h your-cluster.cluster-xxxxx.us-east-1.rds.amazonaws.com \
     -U frigg_admin \
     -d frigg_db \
     -p 5432
```

### Using Connection String

```
postgresql://frigg_admin:PASSWORD@your-cluster.cluster-xxxxx.us-east-1.rds.amazonaws.com:5432/frigg_db
```

### Finding Your Endpoint

The endpoint is available in:
- AWS Console: RDS → Clusters → Your Cluster → Connectivity & Security
- CloudFormation Outputs
- Your Lambda environment variables (`DATABASE_URL`)

## Troubleshooting

### Connection Timeout

**Symptom:** Cannot connect to the database, connection times out

**Solutions:**
1. Verify your IP is whitelisted: `curl https://checkip.amazonaws.com`
2. Check security group rules in AWS Console
3. Ensure the database is in public subnets
4. Verify the endpoint is correct

### Access Denied

**Symptom:** Connection refused or access denied

**Solutions:**
1. Check username and password
2. Verify the database exists
3. Check that the database is publicly accessible in RDS console

### IP Changed

**Symptom:** Was working, now can't connect

**Solutions:**
1. Check if your IP changed (dynamic IP from ISP)
2. Update `allowedIpAddresses` in your app definition
3. Redeploy: `npm run deploy` or `serverless deploy`

## Migration Guide

### From Private to Public

To migrate an existing private deployment to public:

1. Add to your app definition:
   ```javascript
   database: {
     postgres: {
       publiclyAccessible: true,
       allowedIpAddresses: ['YOUR_IP']
     }
   }
   ```

2. Deploy the changes:
   ```bash
   npm run deploy
   ```

3. AWS will modify the instance and move it to public subnets

### From Public to Private

To migrate back to private:

1. Remove or set to false:
   ```javascript
   database: {
     postgres: {
       publiclyAccessible: false
     }
   }
   ```

2. Ensure VPC is properly configured with private subnets

3. Deploy the changes

## Best Practices

1. **Use IP Whitelisting:** Always specify `allowedIpAddresses`
2. **Limit Access:** Only whitelist IPs that need access
3. **Update Regularly:** Review and update IP whitelist periodically
4. **Strong Passwords:** Use strong passwords (automatically generated by Secrets Manager)
5. **Monitor Access:** Enable CloudWatch logs and monitor connections
6. **Production:** Consider using private deployment with VPN/bastion host for production

## AWS Requirements

### DB Subnet Group Requirement

Aurora requires a **DB Subnet Group** with:
- **Minimum 2 subnets**
- **Different Availability Zones** (within the same region)
- All subnets must be either public or private (consistent type)

This is an AWS requirement, not a Frigg limitation. The infrastructure handles this automatically by:
- **Discovery Mode:** Finding 2 public subnets in different AZs
- **Creation Mode:** Creating 2 public subnets in AZ-0 and AZ-1
- **Fallback:** If only 1 public subnet exists, a second one is created automatically

## Limitations

- Aurora Serverless v1 does NOT support public accessibility (only v2)
- Public subnets must have an Internet Gateway attached
- Some AWS regions may have restrictions
- NAT Gateway is not required for public deployments
- At least 2 availability zones must be available in your region

## Related Resources

- [AWS Aurora Serverless v2 Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html)
- [VPC Configuration Guide](./vpc-configuration.md)
- [Security Best Practices](./encryption-and-security.md)

