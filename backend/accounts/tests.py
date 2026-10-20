import re
from datetime import timedelta

import pytest
from django.core import mail
from rest_framework.test import APIClient

from accounts.models import EmailOTP, User


def request_code(client, email="Ravi@Example.com"):
    res = client.post("/api/v1/auth/otp/send/", {"email": email}, format="json")
    assert res.status_code == 200, res.json()
    return re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)


@pytest.fixture
def client(db):
    return APIClient()


def test_login_with_emailed_code(client):
    code = request_code(client)
    assert mail.outbox[-1].to == ["ravi@example.com"]
    res = client.post("/api/v1/auth/otp/verify/", {"email": "ravi@example.com", "code": code}, format="json")
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["email"] == "ravi@example.com" and body["user"]["role"] == "customer"

    client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access']}")
    assert client.get("/api/v1/me/").json()["email"] == "ravi@example.com"
    # A code works only once.
    res = client.post("/api/v1/auth/otp/verify/", {"email": "ravi@example.com", "code": code}, format="json")
    assert res.status_code == 400


def test_wrong_code_locks_after_max_attempts(client):
    code = request_code(client)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(EmailOTP.MAX_ATTEMPTS):
        assert client.post("/api/v1/auth/otp/verify/", {"email": "ravi@example.com", "code": wrong}, format="json").status_code == 400
    assert client.post("/api/v1/auth/otp/verify/", {"email": "ravi@example.com", "code": code}, format="json").status_code == 400


def test_expired_code_rejected_and_resend_throttled(client):
    code = request_code(client)
    assert client.post("/api/v1/auth/otp/send/", {"email": "ravi@example.com"}, format="json").status_code == 429
    EmailOTP.objects.update(created_at=EmailOTP.objects.get().created_at - timedelta(minutes=11))
    assert client.post("/api/v1/auth/otp/verify/", {"email": "ravi@example.com", "code": code}, format="json").status_code == 400


def test_superuser_logs_in_by_email_as_admin(client):
    User.objects.create_superuser("arun", "Owner@Example.com", "pw")
    code = request_code(client, "owner@example.com")
    user = client.post("/api/v1/auth/otp/verify/", {"email": "owner@example.com", "code": code}, format="json").json()["user"]
    assert user["role"] == "admin"
    assert User.objects.count() == 1


def login(client, email="ravi@example.com"):
    tokens = client.post("/api/v1/auth/otp/verify/", {"email": email, "code": request_code(client, email)}, format="json").json()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")


ADDRESS = {"name": "Ravi", "phone": "9876543210", "line1": "12 Main Road", "city": "Chennai",
           "state": "Tamil Nadu", "pincode": "600001"}


def test_addresses_are_private_and_one_is_default(client):
    login(client)
    first = client.post("/api/v1/me/addresses/", ADDRESS, format="json").json()
    assert first["is_default"] is True
    second = client.post("/api/v1/me/addresses/", {**ADDRESS, "city": "Delhi", "is_default": True}, format="json").json()
    listed = client.get("/api/v1/me/addresses/").json()
    assert [a["id"] for a in listed] == [second["id"], first["id"]]
    assert [a["is_default"] for a in listed] == [True, False]

    other = APIClient()
    other.force_authenticate(User.objects.create(username="b@x.com", email="b@x.com"))
    assert other.get("/api/v1/me/addresses/").json() == []
    assert other.delete(f"/api/v1/me/addresses/{first['id']}/").status_code == 404
    assert APIClient().get("/api/v1/me/addresses/").status_code == 401


def test_address_rejects_bad_phone_and_pincode(client):
    login(client)
    res = client.post("/api/v1/me/addresses/", {**ADDRESS, "phone": "12345", "pincode": "0600"}, format="json")
    assert res.status_code == 400
    assert set(res.json()) == {"phone", "pincode"}
