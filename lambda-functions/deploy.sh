#!/bin/bash

echo "Deploying Lambda functions to LocalStack..."

# Wait for LocalStack to be ready
sleep 5

# Create process-todo Lambda function
awslocal lambda create-function \
    --function-name process-todo \
    --runtime python3.13 \
    --role arn:aws:iam::000000000000:role/lambda-role \
    --handler lambda_function.handler \
    --zip-file fileb:///etc/localstack/init/ready.d/process-todo.zip

# Create send-notification Lambda function
awslocal lambda create-function \
    --function-name send-notification \
    --runtime python3.13 \
    --role arn:aws:iam::000000000000:role/lambda-role \
    --handler lambda_function.handler \
    --zip-file fileb:///etc/localstack/init/ready.d/send-notification.zip

echo "Lambda functions deployed successfully!"
