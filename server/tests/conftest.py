import pytest
import httpx
import uuid
import random
import string
from typing import Generator, Dict

# Base URL for the running server
BASE_URL = "http://localhost:8000"

@pytest.fixture(scope="session")
def api_client() -> Generator[httpx.Client, None, None]:
    """
    Fixture to provide an HTTP client for integration tests.
    """
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
        yield client

def generate_random_string(length: int = 10) -> str:
    """Generate a random string for names/passwords."""
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def generate_random_email() -> str:
    """Generate a random email to avoid conflicts."""
    return f"test_user_{uuid.uuid4()}@example.com"

@pytest.fixture
def random_user_data() -> Dict[str, str]:
    """Generate random user data for registration."""
    return {
        "email": generate_random_email(),
        "password": "TestPassword123!",
        "full_name": f"Test User {generate_random_string(5)}"
    }

@pytest.fixture
def registered_user(api_client: httpx.Client, random_user_data: Dict[str, str]) -> Dict[str, str]:
    """
    Register a user and return the user data.
    """
    response = api_client.post("/api/auth/register", json=random_user_data)
    assert response.status_code == 201
    return random_user_data

@pytest.fixture
def authenticated_user_token(api_client: httpx.Client, registered_user: Dict[str, str]) -> str:
    """
    Register and Login a user, returning the access token.
    """
    # Login to get token
    login_data = {
        "username": registered_user["email"],
        "password": registered_user["password"]
    }
    response = api_client.post("/api/auth/login", data=login_data)
    assert response.status_code == 200
    return response.json()["access_token"]

@pytest.fixture
def auth_headers(authenticated_user_token: str) -> Dict[str, str]:
    """Return headers with Bearer token."""
    return {"Authorization": f"Bearer {authenticated_user_token}"}
