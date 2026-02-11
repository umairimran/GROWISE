import uuid
from typing import Dict

import httpx
import pytest

from app.database import SessionLocal
from app import models
from tests.conftest import generate_random_email


@pytest.fixture
def admin_headers(api_client: httpx.Client) -> Dict[str, str]:
    """
    Create a temporary admin user and return authorization headers.

    Flow:
    - Register a normal user via API
    - Promote that user to admin directly in the database
    - Login via API to obtain a valid admin JWT
    """
    email = generate_random_email()
    password = "AdminPass123!"
    full_name = "Test Admin User"

    # 1) Register normal user
    resp = api_client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": full_name,
        },
    )
    assert resp.status_code == 201

    # 2) Promote to admin in the database
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        assert user is not None
        user.role = "admin"
        db.commit()
    finally:
        db.close()

    # 3) Login as this user to get an admin token
    login_resp = api_client.post(
        "/api/auth/login",
        data={"username": email, "password": password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    return {"Authorization": f"Bearer {token}"}


# ============================================================================
# Admin CRUD tests for /api/tracks
# ============================================================================


def test_create_track_requires_auth(api_client: httpx.Client) -> None:
    """
    Creating a track without authentication should be rejected (401).
    """
    payload = {
        "track_name": f"Unauth Track {uuid.uuid4()}",
        "description": "Should not be created without auth",
    }
    resp = api_client.post("/api/tracks/", json=payload)
    assert resp.status_code == 401


def test_create_track_requires_admin(
    api_client: httpx.Client, auth_headers: Dict[str, str]
) -> None:
    """
    A normal authenticated user (non-admin) must not be able to create tracks (403).
    """
    payload = {
        "track_name": f"User Track {uuid.uuid4()}",
        "description": "Normal user should not be allowed to create this",
    }
    resp = api_client.post("/api/tracks/", headers=auth_headers, json=payload)
    assert resp.status_code == 403
    assert "Admin" in resp.text or "admin" in resp.text


def test_admin_can_crud_track(api_client: httpx.Client, admin_headers: Dict[str, str]) -> None:
    """
    Full CRUD happy-path for admin:
    - Create track
    - Read track
    - Update track
    - Delete track
    """
    # CREATE
    track_name = f"Full Stack {uuid.uuid4()}"
    create_payload = {
        "track_name": track_name,
        "description": "Initial description",
    }
    create_resp = api_client.post("/api/tracks/", headers=admin_headers, json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.json()
    track_id = created["track_id"]
    assert created["track_name"] == track_name

    # READ (public)
    get_resp = api_client.get(f"/api/tracks/{track_id}")
    assert get_resp.status_code == 200
    fetched = get_resp.json()
    assert fetched["track_name"] == track_name

    # UPDATE (admin only)
    updated_name = f"{track_name} - Updated"
    update_payload = {
        "track_name": updated_name,
        "description": "Updated description",
    }
    update_resp = api_client.put(
        f"/api/tracks/{track_id}", headers=admin_headers, json=update_payload
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["track_name"] == updated_name
    assert updated["description"] == "Updated description"

    # DELETE (admin only)
    delete_resp = api_client.delete(f"/api/tracks/{track_id}", headers=admin_headers)
    assert delete_resp.status_code == 204

    # Ensure it's gone
    get_after_delete = api_client.get(f"/api/tracks/{track_id}")
    assert get_after_delete.status_code == 404


def test_admin_cannot_create_duplicate_track_name(
    api_client: httpx.Client, admin_headers: Dict[str, str]
) -> None:
    """
    Admin should receive 400 when trying to create a track
    with a name that already exists.
    """
    name = f"Duplicate Track {uuid.uuid4()}"
    payload = {"track_name": name, "description": "First instance"}

    first = api_client.post("/api/tracks/", headers=admin_headers, json=payload)
    assert first.status_code == 201

    second = api_client.post("/api/tracks/", headers=admin_headers, json=payload)
    assert second.status_code == 400
    assert "already exists" in second.text or "already" in second.text


def test_get_all_tracks_public(api_client: httpx.Client, admin_headers: Dict[str, str]) -> None:
    """
    Anyone (even unauthenticated) should be able to list tracks.
    We'll create one via admin, then fetch without auth.
    """
    name = f"Public Track {uuid.uuid4()}"
    payload = {"track_name": name, "description": "Publicly visible track"}
    create_resp = api_client.post("/api/tracks/", headers=admin_headers, json=payload)
    assert create_resp.status_code == 201

    list_resp = api_client.get("/api/tracks/")
    assert list_resp.status_code == 200
    tracks = list_resp.json()
    assert any(t["track_name"] == name for t in tracks)


# ============================================================================
# User track selection tests
# ============================================================================


def test_select_track_requires_auth(api_client: httpx.Client, admin_headers: Dict[str, str]) -> None:
    """
    Selecting a track without authentication should fail with 401.
    """
    # First create a track as admin
    name = f"Selectable Track {uuid.uuid4()}"
    payload = {"track_name": name, "description": "Track for selection test"}
    create_resp = api_client.post("/api/tracks/", headers=admin_headers, json=payload)
    assert create_resp.status_code == 201
    track_id = create_resp.json()["track_id"]

    # Try to select without auth
    select_resp = api_client.post("/api/tracks/select", json={"track_id": track_id})
    assert select_resp.status_code == 401


def test_user_can_select_track_once(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    A normal authenticated user can select a track once.
    Second selection of the same track should return 400.
    """
    # Create track as admin
    name = f"User Select Track {uuid.uuid4()}"
    payload = {"track_name": name, "description": "Track for user selection"}
    create_resp = api_client.post("/api/tracks/", headers=admin_headers, json=payload)
    assert create_resp.status_code == 201
    track_id = create_resp.json()["track_id"]

    # First selection (should succeed)
    select_resp_1 = api_client.post(
        "/api/tracks/select", headers=auth_headers, json={"track_id": track_id}
    )
    assert select_resp_1.status_code == 201
    data_1 = select_resp_1.json()
    assert data_1["track_id"] == track_id

    # Second selection of same track (should fail with 400)
    select_resp_2 = api_client.post(
        "/api/tracks/select", headers=auth_headers, json={"track_id": track_id}
    )
    assert select_resp_2.status_code == 400
    assert "already selected" in select_resp_2.text or "already" in select_resp_2.text


def test_get_my_current_track(
    api_client: httpx.Client, admin_headers: Dict[str, str], auth_headers: Dict[str, str]
) -> None:
    """
    After selecting a track, /api/tracks/my-current-track should return it.
    """
    # Create track as admin
    name = f"Current Track {uuid.uuid4()}"
    payload = {"track_name": name, "description": "Track for current selection"}
    create_resp = api_client.post("/api/tracks/", headers=admin_headers, json=payload)
    assert create_resp.status_code == 201
    track_id = create_resp.json()["track_id"]

    # Select as normal user
    select_resp = api_client.post(
        "/api/tracks/select", headers=auth_headers, json={"track_id": track_id}
    )
    assert select_resp.status_code == 201

    # Get current track
    current_resp = api_client.get("/api/tracks/my-current-track", headers=auth_headers)
    assert current_resp.status_code == 200
    current = current_resp.json()
    assert current["track_id"] == track_id
    assert current["track_name"] == name

