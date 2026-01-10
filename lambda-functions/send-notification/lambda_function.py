import json


def handler(event, context):
    """Lambda function to send notifications"""
    print(f"Sending notification with event: {json.dumps(event)}")

    recipient = event.get("recipient", "user@example.com")
    message = event.get("message", "Notification")
    notification_type = event.get("type", "email")

    result = {
        "statusCode": 200,
        "body": json.dumps(
            {
                "message": "Notification sent successfully",
                "recipient": recipient,
                "type": notification_type,
                "notification_id": f'notif-{context.request_id if context else "12345"}',
            }
        ),
    }

    print(f"Result: {json.dumps(result)}")
    return result
