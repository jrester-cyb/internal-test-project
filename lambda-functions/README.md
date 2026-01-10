# Lambda Functions Setup

## Deploy Lambda functions to LocalStack

After starting the containers, deploy the Lambda functions:

```bash
# Create zip files for Lambda functions
cd lambda-functions
zip -j process-todo.zip process-todo/lambda_function.py
zip -j send-notification.zip send-notification/lambda_function.py

# Copy zip files to LocalStack container
docker cp process-todo.zip testing-postgres-images-localstack-1:/tmp/
docker cp send-notification.zip testing-postgres-images-localstack-1:/tmp/

# Deploy to LocalStack
docker exec testing-postgres-images-localstack-1 awslocal lambda create-function \
    --function-name process-todo \
    --runtime python3.13 \
    --role arn:aws:iam::000000000000:role/lambda-role \
    --handler lambda_function.handler \
    --zip-file fileb:///tmp/process-todo.zip

docker exec testing-postgres-images-localstack-1 awslocal lambda create-function \
    --function-name send-notification \
    --runtime python3.13 \
    --role arn:aws:iam::000000000000:role/lambda-role \
    --handler lambda_function.handler \
    --zip-file fileb:///tmp/send-notification.zip
```

## Test Lambda invocation

```bash
# Test via Django endpoint
curl -X POST http://localhost/lambda/invoke/ \
  -H "Content-Type: application/json" \
  -d '{"function_name": "process-todo", "payload": {"todo_id": 1, "action": "test"}}'

# Or directly via awslocal
docker exec testing-postgres-images-localstack-1 awslocal lambda invoke \
    --function-name process-todo \
    --payload '{"todo_id": 1}' \
    response.json
```
