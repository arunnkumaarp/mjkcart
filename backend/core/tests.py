import pytest
from rest_framework.test import APIClient


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
