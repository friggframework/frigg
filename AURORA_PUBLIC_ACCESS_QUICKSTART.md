# Quick Start: Aurora Public Access with IP Whitelisting

## TL;DR - Add This to Your App Definition

```javascript
{
  database: {
    postgres: {
      enable: true,
      publiclyAccessible: true,
      allowedIpAddresses: [
        'YOUR_IP_ADDRESS/32'
      ],
      management: 'create-new'  // or 'discover' or 'use-existing'
    }
  }
}
```

## Find Your IP Address

```bash
curl https://checkip.amazonaws.com
```

## Complete Example

```javascript
// appDefinition.js
module.exports = {
  name: 'my-frigg-app',
  
  database: {
    postgres: {
      enable: true,
      publiclyAccessible: true,              // Enable public access
      allowedIpAddresses: [
        '73.123.456.789/32',                 // Your IP (replace with actual)
        '192.168.1.0/24'                     // Or an IP range
      ],
      management: 'create-new',
      
      // Optional settings
      masterUsername: 'frigg_admin',
      databaseName: 'frigg_db',
      engineVersion: '15.3',
      scaling: {
        minCapacity: 0.5,
        maxCapacity: 1.0
      }
    }
  },
  
  // VPC is now optional for public access!
  // The database will use your default VPC's public subnets
  
  integrations: [
    // your integrations
  ]
}
```

## What Changed?

### Before (Required Private VPC)
```javascript
{
  vpc: {
    enable: true,  // ❌ Was REQUIRED
    management: 'create-new'
  },
  database: {
    postgres: {
      enable: true,
      // ❌ Always deployed privately
    }
  }
}
```

### After (Public Access Supported)
```javascript
{
  // ✅ VPC is optional for public access
  database: {
    postgres: {
      enable: true,
      publiclyAccessible: true,        // ✅ NEW: Enable public access
      allowedIpAddresses: ['YOUR_IP']  // ✅ NEW: IP whitelist
    }
  }
}
```

## Important: Subnet Requirements

Aurora requires **2 subnets in different availability zones** (AWS requirement). The infrastructure handles this automatically:

- **Discovery:** Finds 2 existing public subnets in different AZs
- **Creation:** Creates 2 public subnets (AZ-0 and AZ-1) automatically
- **No manual configuration needed!**

## Deploy

```bash
npm run deploy
# or
serverless deploy
```

## Common Scenarios

### 1. Single Developer (Your IP Only)

```javascript
{
  database: {
    postgres: {
      enable: true,
      publiclyAccessible: true,
      allowedIpAddresses: '73.123.456.789'  // Your IP
    }
  }
}
```

### 2. Team (Multiple IPs)

```javascript
{
  database: {
    postgres: {
      enable: true,
      publiclyAccessible: true,
      allowedIpAddresses: [
        '73.123.456.789',    // Alice
        '74.234.567.890',    // Bob
        '75.345.678.901'     // Charlie
      ]
    }
  }
}
```

### 3. Office + VPN

```javascript
{
  database: {
    postgres: {
      enable: true,
      publiclyAccessible: true,
      allowedIpAddresses: [
        '203.0.113.10/32',   // Office static IP
        '192.168.1.0/24'     // VPN range
      ]
    }
  }
}
```

## Security Notes

⚠️ **Always specify `allowedIpAddresses`** - Without it, a warning will be shown:
```
⚠️  WARNING: Database is publicly accessible but no IP whitelist configured!
⚠️  Add allowedIpAddresses to your database.postgres config for security.
```

✅ **Best Practices:**
- Use `/32` for single IP addresses
- Use CIDR notation for ranges (e.g., `/24` for 256 IPs)
- Review and update IPs regularly
- Consider VPN for production environments

## Connect to Your Database

After deployment, connect using:

```bash
# Get your IP (if you don't have it)
curl https://checkip.amazonaws.com

# Connect with psql
psql -h your-cluster-endpoint.rds.amazonaws.com \
     -U frigg_admin \
     -d frigg_db \
     -p 5432
```

Password is stored in AWS Secrets Manager (check CloudFormation outputs).

## Troubleshooting

### Can't Connect?

1. **Check your current IP:**
   ```bash
   curl https://checkip.amazonaws.com
   ```

2. **Verify it matches your whitelist** in `allowedIpAddresses`

3. **Update if needed:**
   - Edit your app definition
   - Run `npm run deploy`

### IP Changed?

If your ISP uses dynamic IPs, you may need to:
- Use a broader range (e.g., `/24` instead of `/32`)
- Use a VPN with a static IP
- Update the whitelist when your IP changes

## Full Documentation

For complete details, see: [docs/reference/aurora-public-access.md](docs/reference/aurora-public-access.md)

## Changes Summary

### New Features
1. ✅ Aurora can be publicly accessible
2. ✅ IP whitelist support
3. ✅ VPC is optional for public deployments
4. ✅ Automatic subnet selection (public vs private)
5. ✅ Security group auto-configuration

### New Configuration Options
- `database.postgres.publiclyAccessible` (boolean)
- `database.postgres.allowedIpAddresses` (string | string[])

### Backward Compatibility
- ✅ Existing private deployments work unchanged
- ✅ Default behavior (publiclyAccessible: false) unchanged
- ✅ No breaking changes

