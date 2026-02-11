import httpx

try:
    print("Attempting to register user...")
    response = httpx.post(
        "http://localhost:8000/api/auth/register",
        json={
            "email": "debug_test@example.com",
            "password": "Password123!",
            "full_name": "Debug User"
        },
        timeout=10.0
    )
    print(f"Status Code: {response.status_code}")
    print("Response Body:")
    print(response.text)
except Exception as e:
    print(f"Request failed: {e}")
