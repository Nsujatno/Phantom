import requests
import json

url = "http://localhost:8000/apply-step"

payload = {
    "page_title": "Software Engineer Application",
    "fields": [
        {
            "id": "input-email",
            "name": "email",
            "type": "email",
            "required": True,
            "label": "Email Address"
        },
        {
            "id": "input-exp",
            "name": "experience",
            "type": "number",
            "required": True,
            "label": "Years of Python Experience"
        },
        {
            "id": "select-relocate",
            "name": "relocate",
            "type": "select",
            "required": True,
            "label": "Willing to relocate?",
            "options": ["Yes", "No"]
        }
    ]
}

try:
    response = requests.post(url, json=payload, timeout=30)
    print("Status:", response.status_code)
    print("Response:", response.json())
except Exception as e:
    print("Error:", e)
