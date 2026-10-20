import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User


@pytest.mark.django_db
def test_health_and_public_shop_settings():
    client = APIClient()
    assert client.get("/api/v1/health/").json() == {"status": "ok"}
    shop = client.get("/api/v1/shop/").json()
    assert shop["shop_name"] == "MJK Cart" and shop["cod_enabled"] is True


@pytest.mark.django_db
def test_openapi_schema_is_served():
    res = APIClient().get("/api/schema/?format=json")
    assert res.status_code == 200
    assert "/api/v1/auth/otp/verify/" in res.json()["paths"]


def as_role(role):
    client = APIClient()
    client.force_authenticate(User.objects.create(username=f"{role}@x.com", email=f"{role}@x.com", role=role))
    return client


def qr_png():
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "black").save(buf, "PNG")
    return SimpleUploadedFile("qr.png", buf.getvalue(), content_type="image/png")


@pytest.mark.django_db
def test_admin_edits_shop_settings_and_public_sees_them():
    admin = as_role(User.Role.ADMIN)
    res = admin.patch("/api/v1/staff/shop/", {"shop_name": "MJK Stores", "upi_id": "mjk@okaxis",
                                               "shipping_flat": "79.00", "cod_enabled": False}, format="json")
    assert res.status_code == 200, res.json()
    shop = APIClient().get("/api/v1/shop/").json()
    assert (shop["shop_name"], shop["upi_id"], shop["shipping_flat"], shop["cod_enabled"]) == \
        ("MJK Stores", "mjk@okaxis", "79.00", False)


@pytest.mark.django_db
def test_upload_and_remove_upi_qr(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    admin = as_role(User.Role.ADMIN)
    res = admin.patch("/api/v1/staff/shop/", {"upi_qr": qr_png()}, format="multipart")
    assert res.status_code == 200 and res.json()["upi_qr"].endswith(".png")
    assert any(tmp_path.rglob("*.png"))

    res = admin.patch("/api/v1/staff/shop/", {"upi_qr": ""}, format="multipart")
    assert res.json()["upi_qr"] is None and not any(tmp_path.rglob("*.png"))


@pytest.mark.django_db
def test_shop_settings_validation():
    admin = as_role(User.Role.ADMIN)
    bad = {"support_phone": "12345", "upi_id": "not-a-upi", "cod_fee": "-5", "cod_max_order": "0"}
    for field, value in bad.items():
        res = admin.patch("/api/v1/staff/shop/", {field: value}, format="json")
        assert res.status_code == 400 and field in res.json(), field
    assert admin.patch("/api/v1/staff/shop/", {"support_phone": ""}, format="json").status_code == 200


@pytest.mark.django_db
def test_shop_settings_are_admin_only():
    assert as_role(User.Role.STAFF).get("/api/v1/staff/shop/").status_code == 403
    assert APIClient().patch("/api/v1/staff/shop/", {"shop_name": "X"}, format="json").status_code == 401
