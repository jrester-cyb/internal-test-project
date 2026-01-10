import json


def handler(event, context):
    """Lambda function to process a todo"""
    print(f"Processing todo with event: {json.dumps(event)}")

    todo_id = event.get("todo_id")
    action = event.get("action", "process")
    title = event.get("title", "Unknown")
    completed = event.get("completed", False)

    # Simulate processing
    result = {
        "statusCode": 200,
        "body": json.dumps(
            {
                "message": f"Todo {todo_id} ({title}) {action}ed successfully",
                "todo_id": todo_id,
                "completed": completed,
                "processed": True,
            }
        ),
    }

    print(f"Result: {json.dumps(result)}")
    return result
