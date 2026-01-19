#!/bin/bash
# LocalStack initialization script
# Creates KMS keys and S3 buckets for local development
# This script is idempotent - safe to run multiple times

set -e

echo "Setting up LocalStack AWS resources..."

# Wait for LocalStack to be ready
echo "Waiting for LocalStack services..."
sleep 2

# Check if KMS alias already exists
echo "Checking for existing KMS key..."
EXISTING_KEY=$(awslocal kms list-aliases --query "Aliases[?AliasName=='alias/mfa-key'].TargetKeyId" --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_KEY" ] && [ "$EXISTING_KEY" != "None" ]; then
    echo "KMS key alias/mfa-key already exists with KeyId: $EXISTING_KEY"
    KMS_KEY_ID="$EXISTING_KEY"
else
    # Create KMS key for MFA secret encryption
    echo "Creating KMS key for MFA encryption..."
    KMS_KEY_OUTPUT=$(awslocal kms create-key \
        --description "MFA secret encryption key" \
        --key-usage ENCRYPT_DECRYPT \
        --origin AWS_KMS \
        --output json)

    KMS_KEY_ID=$(echo "$KMS_KEY_OUTPUT" | grep -o '"KeyId": "[^"]*"' | cut -d'"' -f4)
    echo "Created KMS key: $KMS_KEY_ID"

    # Create alias for the key
    echo "Creating alias for KMS key..."
    awslocal kms create-alias \
        --alias-name alias/mfa-key \
        --target-key-id "$KMS_KEY_ID"

    echo "Created alias: alias/mfa-key"

    # Enable automatic key rotation (simulated in LocalStack)
    echo "Enabling key rotation..."
    awslocal kms enable-key-rotation --key-id "$KMS_KEY_ID" || true
fi

# Create S3 buckets (mb is idempotent - won't fail if bucket exists)
echo "Creating S3 bucket for file storage..."
awslocal s3 mb s3://app-files --region us-east-1 2>/dev/null || echo "Bucket app-files already exists"

echo "Creating S3 bucket for backups..."
awslocal s3 mb s3://app-backups --region us-east-1 2>/dev/null || echo "Bucket app-backups already exists"

# List created resources
echo ""
echo "=== LocalStack Setup Complete ==="
echo "KMS Keys:"
awslocal kms list-aliases --query 'Aliases[?starts_with(AliasName, `alias/`)]' --output table

echo ""
echo "S3 Buckets:"
awslocal s3 ls

echo ""
echo "LocalStack is ready for development!"
