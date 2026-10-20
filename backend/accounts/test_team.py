import pytest
from django.core import mail
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User

R = User.Role


def client_for(user):
    """Logs in with a real token, so role changes are seen on the next request as in the apps."""
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return client


@pytest.fixture
def owner(db):
    return User.objects.create(username="o@x.com", email="o@x.com", role=R.ADMIN)


@pytest.fixture
def admin(owner):
    return client_for(owner)


def invite(admin, email, role="staff", **extra):
    return admin.post("/api/v1/staff/team/", {"email": email, "role": role, **extra}, format="json")


def test_invite_new_person_who_then_has_staff_access(admin):
    res = invite(admin, "Priya@Shop.in", first_name="Priya")
    assert res.status_code == 201 and res.json()["email"] == "priya@shop.in" and res.json()["role"] == "staff"
    assert mail.outbox[-1].to == ["priya@shop.in"] and "staff access" in mail.outbox[-1].body

    priya = client_for(User.objects.get(email="priya@shop.in"))
    assert priya.get("/api/v1/staff/orders/").status_code == 200
    assert priya.get("/api/v1/staff/team/").status_code == 403
    assert [m["email"] for m in admin.get("/api/v1/staff/team/").json()] == ["o@x.com", "priya@shop.in"]


def test_existing_customer_is_promoted_not_duplicated(admin):
    User.objects.create(username="ravi@x.com", email="ravi@x.com")
    assert invite(admin, "RAVI@x.com", "admin").json()["role"] == "admin"
    assert User.objects.filter(email__iexact="ravi@x.com").count() == 1
    assert "email" in invite(admin, "ravi@x.com").json()


def test_change_role_and_remove_takes_effect_at_once(admin):
    member = invite(admin, "priya@shop.in").json()
    priya = client_for(User.objects.get(pk=member["id"]))
    assert admin.patch(f"/api/v1/staff/team/{member['id']}/", {"role": "admin"}, format="json").json()["role"] == "admin"
    assert priya.get("/api/v1/staff/team/").status_code == 200

    assert admin.delete(f"/api/v1/staff/team/{member['id']}/").status_code == 204
    assert User.objects.get(pk=member["id"]).role == "customer"
    assert priya.get("/api/v1/staff/orders/").status_code == 403
    assert admin.get(f"/api/v1/staff/team/{member['id']}/").status_code == 404


def test_cannot_change_self_or_superuser(admin, owner):
    res = admin.patch(f"/api/v1/staff/team/{owner.id}/", {"role": "staff"}, format="json")
    assert res.json() == {"role": ["You can't change your own role. Ask another admin."]}
    assert admin.delete(f"/api/v1/staff/team/{owner.id}/").status_code == 400

    boss = User.objects.create_superuser("boss", "boss@x.com", "pw")
    assert "Owner accounts" in admin.delete(f"/api/v1/staff/team/{boss.id}/").json()["detail"]
    assert admin.get(f"/api/v1/staff/team/{boss.id}/").json()["role"] == "admin"


def test_one_admin_can_remove_another(admin, owner):
    second = client_for(User.objects.get(pk=invite(admin, "a2@x.com", "admin").json()["id"]))
    assert second.delete(f"/api/v1/staff/team/{owner.id}/").status_code == 204
    assert admin.get("/api/v1/staff/team/").status_code == 403


def test_team_is_admin_only(db):
    staff = client_for(User.objects.create(username="s@x.com", email="s@x.com", role=R.STAFF))
    assert staff.get("/api/v1/staff/team/").status_code == 403
    assert invite(staff, "x@x.com").status_code == 403
