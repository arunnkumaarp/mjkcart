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


@pytest.fixture
def fresh_throttle():
    from django.core.cache import cache
    cache.clear()


def test_password_login_by_username_or_email(client, fresh_throttle):
    User.objects.create_superuser("mjkadmin", "Owner@Example.com", "s3cret-pass")
    for name in ("mjkadmin", "MJKADMIN", "owner@example.com"):
        res = client.post("/api/v1/auth/login/", {"username": name, "password": "s3cret-pass"}, format="json")
        assert res.status_code == 200, res.json()
        assert res.json()["user"]["role"] == "admin"
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['access']}")
    assert client.get("/api/v1/me/").json()["email"].lower() == "owner@example.com"


def test_password_login_rejects_wrong_password_and_codeonly_accounts(client, fresh_throttle):
    User.objects.create_user("ravi", "ravi@example.com", "right-pass")
    User.objects.create(username="meena@example.com", email="meena@example.com")  # made by the email code, no password
    for name, pw in (("ravi", "wrong-pass"), ("nobody", "right-pass"), ("meena@example.com", "")):
        res = client.post("/api/v1/auth/login/", {"username": name, "password": pw or "anything"}, format="json")
        assert res.status_code == 400
        assert res.json()["detail"] == "Wrong username or password."


def test_password_login_is_rate_limited(client, fresh_throttle):
    for _ in range(10):
        client.post("/api/v1/auth/login/", {"username": "x", "password": "y"}, format="json")
    assert client.post("/api/v1/auth/login/", {"username": "x", "password": "y"}, format="json").status_code == 429


def test_signed_up_buyer_sets_password_then_logs_in_with_it(client, fresh_throttle):
    login(client)
    assert client.post("/api/v1/me/password/", {"password": "short"}, format="json").status_code == 400
    assert client.post("/api/v1/me/password/", {"password": "chennai-2026"}, format="json").status_code == 200
    client.credentials()
    assert client.post("/api/v1/me/password/", {"password": "chennai-2026"}, format="json").status_code == 401
    res = client.post("/api/v1/auth/login/", {"username": "ravi@example.com", "password": "chennai-2026"}, format="json")
    assert res.status_code == 200 and res.json()["user"]["role"] == "customer"


NEW = {"name": "Meena", "email": "Meena@Example.com", "phone": "9876543210", "password": "jasmine-2026"}


def test_signup_then_log_in_with_the_same_details(client, fresh_throttle):
    res = client.post("/api/v1/auth/signup/", NEW, format="json")
    assert res.status_code == 201, res.json()
    assert res.json()["access"] and res.json()["user"]["role"] == "customer"
    user = User.objects.get(email="meena@example.com")
    assert (user.first_name, user.phone, user.username) == ("Meena", "9876543210", "meena@example.com")
    login = client.post("/api/v1/auth/login/", {"username": "meena@example.com", "password": "jasmine-2026"},
                        format="json")
    assert login.status_code == 200


def test_signup_refuses_a_taken_email_and_bad_details(client, fresh_throttle):
    client.post("/api/v1/auth/signup/", NEW, format="json")
    again = client.post("/api/v1/auth/signup/", NEW | {"email": "MEENA@example.com"}, format="json")
    assert again.status_code == 400 and "already an account" in again.json()["email"][0]
    for bad, field in (({"phone": "12345"}, "phone"), ({"password": "short"}, "password"), ({"name": "  "}, "name")):
        res = client.post("/api/v1/auth/signup/", NEW | {"email": "x@example.com"} | bad, format="json")
        assert res.status_code == 400 and field in res.json(), (bad, res.json())
    assert not User.objects.filter(email="x@example.com").exists()
