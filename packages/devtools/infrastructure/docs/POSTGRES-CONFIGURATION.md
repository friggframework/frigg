# PostgreSQL (Aurora) Configuration Guide

This guide covers Aurora PostgreSQL provisioning and configuration in Frigg Framework applications.

## Overview

Frigg Framework supports automatic provisioning of Amazon Aurora Serverless v2 PostgreSQL databases for your integrations. Aurora databases are deployed in the same VPC as your Lambda functions with secure access via AWS Secrets Manager.

### Key Features

- **Aurora Serverless v2**: Cost-efficient auto-scaling database (0.5-4 ACU default)
- **VPC Integration**: Deployed in same private subnets as Lambda functions
- **Secrets Manager**: Automatic credential management and rotation
- **Three Management Modes**: discover, managed, use-existing
- **Security**: Private subnet deployment with security group isolation
- **High Availability**: Multi-AZ deployment with automatic failover

---

## Configuration Schema

### App Definition Structure

These are the keys the Aurora builder reads (see `database.postgres` in
`packages/schemas/schemas/app-definition.schema.json`). `frigg validate`
rejects any other key under `database.postgres`.

```javascript
// backend/index.js
const appDefinition = {
    name: 'my-frigg-app',

    // VPC Configuration (required for Aurora)
    vpc: {
        enable: true,
    },

    // Aurora PostgreSQL Configuration
    database: {
        postgres: {
            enable: true,

            // 'discover' (also when omitted) | 'managed' | 'use-existing'
            // Ignored when managementMode is 'managed' or 'existing'.
            management: 'discover',

            database: 'frigg',        // database name (default 'frigg')
            username: 'postgres',     // master user (default 'postgres')
            engineVersion: '15.13',   // Aurora PostgreSQL version (default '15.13')

            // Aurora Serverless v2 capacity, in ACUs (0.5-128)
            minCapacity: 0.5,         // default 0.5
            maxCapacity: 4,           // default 4

            publiclyAccessible: false,     // default false (private subnets)
            autoCreateCredentials: false,  // discover only: create a secret for a discovered cluster

            // use-existing only
            // endpoint: 'mydb.cluster-abc123.us-east-1.rds.amazonaws.com',
            // port: 5432,
        }
    }
};

module.exports = {
    Definition: appDefinition,
};
```

Backup retention (7 days), the backup and maintenance windows and deletion
settings are fixed by the builder and are not configurable through the app
definition.

---

## Management Modes

### 1. Discover Mode (Default)

Discovers an existing Aurora cluster, or creates a new one in the stack if none is found.

```javascript
database: {
    postgres: {
        enable: true,
        management: 'discover',  // Default
    }
}
```

**Discovery Priority**:
1. Frigg-managed cluster with matching service + stage tags
2. Any Frigg-managed cluster
3. First available Aurora PostgreSQL cluster
4. Creates new cluster if none found

**Best For**: Development and staging environments where you want automatic setup.

---

### 2. Managed Mode

Creates the cluster, instance, subnet group and secret in the stack.

```javascript
database: {
    postgres: {
        enable: true,
        management: 'managed',
        minCapacity: 1,
        maxCapacity: 2,
    }
}
```

With the top-level `managementMode: 'managed'` (and `vpcIsolation: 'isolated'`),
Frigg manages the database per stage and `database.postgres.management` is ignored.

**Best For**: Production environments where you want dedicated database resources.

---

### 3. Use-Existing Mode

Connects to an existing PostgreSQL endpoint without creating database resources.

```javascript
database: {
    postgres: {
        enable: true,
        management: 'use-existing',
        endpoint: 'my-cluster.cluster-abc123.us-east-1.rds.amazonaws.com', // required
        port: 5432,
        database: 'frigg_db',
        username: 'frigg_admin',
    }
}
```

To use an existing cluster by identifier instead, use the ownership form:
`ownership: { cluster: 'external', instance: 'external' }` with
`external: { clusterIdentifier, instanceIdentifier, secretArn }`.

**Best For**: Shared database scenarios or when you manage Aurora outside of Frigg.

---

## Created AWS Resources

When provisioning Aurora (`managed`, or `discover` mode without an existing cluster), Frigg creates:

### 1. RDS DB Subnet Group
- **Name**: `{service}-{stage}-db-subnet-group`
- **Subnets**: Uses same private subnets as Lambda functions
- **Purpose**: Defines which subnets Aurora can use

### 2. Security Group
- **Name**: `{service}-{stage}-aurora-sg`
- **Ingress**: Port 5432 from Lambda security group
- **Purpose**: Allows Lambda → Aurora communication

### 3. Secrets Manager Secret
- **Name**: `{service}-{stage}-aurora-credentials`
- **Contents**: `{ username, password }`
- **Purpose**: Stores database credentials securely
- **Rotation**: Automatic (optional, can be configured)

### 4. Aurora Cluster
- **Engine**: aurora-postgresql (version 15.3 default)
- **Mode**: Provisioned (Serverless v2)
- **Scaling**: 0.5-1.0 ACU (configurable)
- **Backup**: 7-day retention (configurable)
- **Multi-AZ**: Yes (high availability)

### 5. Aurora Instance
- **Class**: db.serverless
- **Cluster**: Attached to cluster above
- **Public Access**: No (private subnet only)

### 6. IAM Permissions
- **Secrets Manager**: GetSecretValue, DescribeSecret
- **Purpose**: Lambda functions can retrieve credentials

---

## Cost Optimization

### Default Configuration (Most Cost-Efficient)

```javascript
database: {
    postgres: {
        enable: true,
        // Uses defaults:
        // - 0.5 ACU minimum (scales to near-zero during idle)
        // - 1.0 ACU maximum
        // - No Performance Insights
        // - 7-day backup retention
    }
}
```

**Estimated Monthly Costs**:
- **Idle/Low Traffic**: $15-30/month (0.5 ACU minimum)
- **Moderate Traffic**: $30-60/month (0.5-1.0 ACU average)
- **Storage**: $0.10/GB-month
- **Backup Storage**: Free (within retention period)

### Production Configuration

```javascript
database: {
    postgres: {
        enable: true,
        minCapacity: 1,  // Higher baseline for production
        maxCapacity: 4,  // Handle traffic spikes
    }
}
```

Backup retention, Performance Insights and deletion protection are not
configurable through the app definition; change them on the cluster.

**Estimated Monthly Costs**:
- **Baseline**: $87/month (1.0 ACU minimum)
- **Peak Traffic**: $348/month (4.0 ACU maximum)
- **Performance Insights**: $7/month

### Cost-Saving Tips

1. **Use Aurora Serverless v2**: Scales to near-zero during idle periods
2. **Right-size ACU limits**: Start with defaults, increase only if needed
3. **Disable Performance Insights** in dev/staging
4. **Shorter backup retention** for non-production (7 days)
5. **Monitor CloudWatch metrics** to optimize scaling configuration

---

## Security Best Practices

### 1. Network Isolation

- ✅ **Private Subnets Only**: Aurora deployed in private subnets (no internet access)
- ✅ **Security Groups**: Restricts access to Lambda security group only
- ✅ **VPC Endpoints**: Use VPC endpoints for AWS services (no NAT Gateway costs)

### 2. Credential Management

- ✅ **Secrets Manager**: Never hardcode database passwords
- ✅ **Auto-Rotation**: Enable automatic secret rotation (recommended)
- ✅ **IAM Integration**: Lambda uses IAM role to access secrets
- ❌ **Never commit** `DATABASE_URL` to source control

### 3. Access Control

```javascript
// Lambda functions automatically get DATABASE_URL from Secrets Manager
// No manual credential management required

// Example: Prisma client automatically uses DATABASE_URL
import { prismaClient } from '@friggframework/core/database/prisma';

const users = await prismaClient.user.findMany();
```

### 4. Deletion Protection

Deletion protection is not configurable through the app definition. Enable it
on the cluster in the AWS console (or with the AWS CLI); you must then disable
it before deleting the stack.

---

## Environment Variables

### Automatically Set

Frigg automatically sets these environment variables for Lambda functions:

```bash
# Database connection (from Secrets Manager)
DATABASE_URL=postgresql://user:pass@endpoint:5432/dbname

# Database type (for Prisma client selection)
DB_TYPE=postgresql

# Discovery metadata (for debugging)
AWS_DISCOVERY_AURORA_CLUSTER_ID=my-cluster
AWS_DISCOVERY_AURORA_ENDPOINT=my-cluster.cluster-abc.us-east-1.rds.amazonaws.com
AWS_DISCOVERY_AURORA_PORT=5432
AWS_DISCOVERY_AURORA_SECRET_ARN=arn:aws:secretsmanager:...
```

### Usage in Lambda Functions

```javascript
// No manual configuration needed!
// DATABASE_URL is automatically available

import { prismaClient } from '@friggframework/core/database/prisma';

export async function handler(event, context) {
    // Prisma client uses DATABASE_URL automatically
    const result = await prismaClient.user.create({
        data: { email: 'user@example.com' }
    });

    return { statusCode: 200, body: JSON.stringify(result) };
}
```

---

## Local Development

### Option 1: Docker Compose PostgreSQL

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: frigg_admin
      POSTGRES_PASSWORD: local_password
      POSTGRES_DB: frigg_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

```bash
# .env (local development)
DATABASE_URL=postgresql://frigg_admin:local_password@localhost:5432/frigg_db
DB_TYPE=postgresql
```

### Option 2: Connect to AWS Aurora (Not Recommended)

```bash
# .env (staging Aurora - for testing only)
DATABASE_URL=postgresql://user:pass@staging-cluster.abc.us-east-1.rds.amazonaws.com:5432/frigg_db
DB_TYPE=postgresql
```

**Security Note**: Never commit Aurora credentials to source control. Use AWS SSO or parameter store for team access.

---

## Migration Guide

### From External PostgreSQL to Aurora

1. **Backup Existing Database**
   ```bash
   pg_dump -h old-host -U user -d dbname > backup.sql
   ```

2. **Deploy Aurora Cluster**
   ```javascript
   // backend/index.js
   database: {
       postgres: {
           enable: true,
           management: 'managed',
       }
   }
   ```

   ```bash
   npm run frigg:deploy
   ```

3. **Restore to Aurora**
   ```bash
   # Get Aurora endpoint from AWS console or deployment output
   psql -h aurora-endpoint.us-east-1.rds.amazonaws.com -U frigg_admin -d frigg_db < backup.sql
   ```

4. **Run Migrations**
   ```bash
   npm run frigg:db:setup
   ```

### From MongoDB to PostgreSQL

1. **Add PostgreSQL Configuration**
   ```javascript
   database: {
       postgres: {
           enable: true,
           management: 'managed',
       }
   }
   ```

2. **Run Prisma Migrations**
   ```bash
   # Generate Prisma PostgreSQL client
   npm run frigg:db:setup
   ```

3. **Data Migration Script** (custom per application)
   ```javascript
   // migrate-data.js
   const { MongoClient } = require('mongodb');
   const { prismaClient } = require('@friggframework/core/database/prisma');

   async function migrate() {
       const mongo = await MongoClient.connect(process.env.MONGO_URI);
       const users = await mongo.db().collection('users').find().toArray();

       for (const user of users) {
           await prismaClient.user.create({
               data: {
                   id: user._id.toString(),
                   email: user.email,
                   // ... map fields
               }
           });
       }

       await mongo.close();
   }

   migrate().catch(console.error);
   ```

---

## Troubleshooting

### Issue: "No Aurora cluster found"

**Error**:
```
No Aurora cluster found in discovery mode. Set management to "managed" or provide endpoint with "use-existing".
```

**Solution**:
1. Check VPC is enabled: `vpc.enable: true`
2. Set management mode: `management: 'managed'`
3. Or connect to a known endpoint: `management: 'use-existing'`, `endpoint: '...'`

---

### Issue: "Timeout connecting to database"

**Symptoms**: Lambda functions timeout when connecting to Aurora

**Possible Causes**:
1. **Security Group Misconfiguration**
   - Check Lambda SG can access Aurora SG on port 5432
   - Verify Aurora SG allows inbound from Lambda SG

2. **VPC/Subnet Issues**
   - Ensure Lambda and Aurora in same VPC
   - Verify Aurora in private subnets
   - Check route tables allow internal VPC traffic

3. **Secret Not Found**
   - Verify Secrets Manager secret exists
   - Check IAM role has secretsmanager:GetSecretValue permission

**Debug Steps**:
```bash
# Check Aurora cluster status
aws rds describe-db-clusters --db-cluster-identifier my-cluster

# Check security groups
aws ec2 describe-security-groups --group-ids sg-xxx

# Test Lambda → Aurora connectivity (requires VPC endpoint or NAT)
aws lambda invoke --function-name test-db-connection output.json
```

---

### Issue: "Insufficient capacity"

**Error**:
```
Cannot create Aurora cluster: InsufficientDBInstanceCapacity
```

**Solution**:
1. Try different availability zones
2. Change instance class (though Serverless v2 shouldn't have this issue)
3. Contact AWS support for capacity increase

---

### Issue: "Cost unexpectedly high"

**Symptoms**: Aurora costs higher than expected

**Investigation**:
1. **Check ACU Usage**:
   ```bash
   # CloudWatch metric: ServerlessDatabaseCapacity
   aws cloudwatch get-metric-statistics \
     --namespace AWS/RDS \
     --metric-name ServerlessDatabaseCapacity \
     --dimensions Name=DBClusterIdentifier,Value=my-cluster \
     --start-time 2024-01-01T00:00:00Z \
     --end-time 2024-01-02T00:00:00Z \
     --period 3600 \
     --statistics Average
   ```

2. **Review Scaling Configuration**:
   - Lower `maxCapacity` if traffic spikes are rare
   - Increase `minCapacity` only if cold starts are an issue

3. **Check for Long-Running Connections**:
   - Aurora doesn't scale down if connections are open
   - Review application connection pooling

4. **Disable Performance Insights** in non-production

---

## Advanced Configuration

### Custom Engine Version

```javascript
database: {
    postgres: {
        enable: true,
        engineVersion: '16.4',  // Default: 15.13
    }
}
```

The backup window, backup retention and Performance Insights are set by the
builder and are not configurable through the app definition.

### Read Replicas (Not Supported Yet)

Frigg currently provisions a single Aurora instance. For read replicas:

1. Manually add instances in AWS console
2. Or create custom CloudFormation resources in `backend/infrastructure.js`

---

## Reference

### Aurora Serverless v2 ACU Sizing

| ACUs | RAM   | Approx Monthly Cost | Use Case                    |
|------|-------|---------------------|-----------------------------|
| 0.5  | 1 GB  | $43                 | Development, low traffic    |
| 1.0  | 2 GB  | $87                 | Staging, moderate traffic   |
| 2.0  | 4 GB  | $174                | Production, steady traffic  |
| 4.0  | 8 GB  | $348                | Production, high traffic    |
| 8.0  | 16 GB | $696                | Production, very high traffic|

**Note**: Costs as of 2024, us-east-1 region. Check current pricing at [AWS Pricing](https://aws.amazon.com/rds/aurora/pricing/).

### Supported PostgreSQL Versions

- 15.3 (recommended, default)
- 15.2
- 14.6
- 14.5
- 13.9

Check [Aurora PostgreSQL Releases](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraPostgreSQLReleaseNotes/AuroraPostgreSQL.Updates.html) for latest versions.

---

## Related Documentation

- [VPC Configuration Guide](VPC-CONFIGURATION.md)
- [Secrets Manager Integration](SECRETS-MANAGER.md)
- [Database Migrations](../frigg-cli/DB-SETUP.md)
- [AWS Discovery Troubleshooting](AWS-DISCOVERY-TROUBLESHOOTING.md)

---

## Support

- **Issues**: [GitHub Issues](https://github.com/friggframework/frigg/issues)
- **Documentation**: [Frigg Framework Docs](https://docs.friggframework.org)
- **Community**: [Slack Channel](https://friggframework.org/#contact)
