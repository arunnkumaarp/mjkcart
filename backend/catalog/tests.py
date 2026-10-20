import pytest
from rest_framework.test import APIClient

from accounts.models import User
from catalog.models import Product


def as_role(role):
    client = APIClient()
    client.force_authenticate(User.objects.create(username=f"{role}@x.com", email=f"{role}@x.com", role=role))
    return client


TEA = {"name": "Masala Tea 250g", "description": "Strong CTC blend.", "price": "180.00", "mrp": "200.00", "stock": 25}


@pytest.mark.django_db
def test_admin_adds_product_and_customers_see_it():
    admin = as_role(User.Role.ADMIN)
    res = admin.post("/api/v1/products/", TEA, format="json")
    assert res.status_code == 201, res.json()
    assert res.json()["slug"] == "masala-tea-250g"

    public = APIClient()
    listed = public.get("/api/v1/products/").json()
    assert [p["name"] for p in listed] == ["Masala Tea 250g"]
    assert public.get("/api/v1/products/masala-tea-250g/").json()["price"] == "180.00"
    assert public.get("/api/v1/products/?search=ctc").json()[0]["slug"] == "masala-tea-250g"


@pytest.mark.django_db
def test_removed_product_is_hidden_but_kept():
    admin = as_role(User.Role.ADMIN)
    slug = admin.post("/api/v1/products/", TEA, format="json").json()["slug"]
    assert admin.delete(f"/api/v1/products/{slug}/").status_code == 204

    assert Product.objects.get(slug=slug).is_active is False
    public = APIClient()
    assert public.get("/api/v1/products/").json() == []
    assert public.get(f"/api/v1/products/{slug}/").status_code == 404
    # Staff still see it and can bring it back.
    assert admin.get(f"/api/v1/products/{slug}/").status_code == 200
    admin.patch(f"/api/v1/products/{slug}/", {"is_active": True}, format="json")
    assert len(public.get("/api/v1/products/").json()) == 1


@pytest.mark.django_db
def test_only_staff_and_admins_change_products():
    assert APIClient().post("/api/v1/products/", TEA, format="json").status_code == 401
    assert as_role(User.Role.CUSTOMER).post("/api/v1/products/", TEA, format="json").status_code == 403
    assert as_role(User.Role.STAFF).post("/api/v1/products/", TEA, format="json").status_code == 201


@pytest.mark.django_db
def test_same_name_gets_unique_slug_and_bad_prices_rejected():
    admin = as_role(User.Role.ADMIN)
    admin.post("/api/v1/products/", TEA, format="json")
    assert admin.post("/api/v1/products/", TEA, format="json").json()["slug"] == "masala-tea-250g-2"
    res = admin.post("/api/v1/products/", {**TEA, "price": "250.00"}, format="json")
    assert res.status_code == 400 and "mrp" in res.json()
