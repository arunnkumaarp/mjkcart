import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User
from catalog.models import Product, ProductImage, Variant


def as_role(role):
    client = APIClient()
    client.force_authenticate(User.objects.create(username=f"{role}@x.com", email=f"{role}@x.com", role=role))
    return client


@pytest.fixture
def admin(db):
    return as_role(User.Role.ADMIN)


@pytest.fixture(autouse=True)
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def add_product(admin, name="Masala Tea", category=None, variants=({"size": "250g", "price": "180.00", "stock": 5},)):
    product = admin.post("/api/v1/products/", {"name": name, "category": category}, format="json").json()
    for v in variants:
        assert admin.post("/api/v1/variants/", {"product": product["id"], **v}, format="json").status_code == 201
    return product


def results(res):
    return res.json()["results"]


def test_admin_adds_product_with_variants_and_customers_see_it(admin):
    product = add_product(admin, variants=[
        {"size": "250g", "price": "180.00", "mrp": "200.00", "stock": 5, "weight_grams": 270},
        {"size": "500g", "price": "340.00", "stock": 0},
    ])
    assert product["slug"] == "masala-tea" and product["price_from"] is None

    public = APIClient()
    card = results(public.get("/api/v1/products/"))[0]
    assert card["price_from"] == "180.00" and card["in_stock"] is True
    detail = public.get("/api/v1/products/masala-tea/").json()
    assert [v["label"] for v in detail["variants"]] == ["250g", "500g"]


def test_product_without_active_variants_is_hidden_from_customers(admin):
    product = add_product(admin, variants=[])
    public = APIClient()
    assert results(public.get("/api/v1/products/")) == []
    assert len(results(admin.get("/api/v1/products/"))) == 1

    variant = admin.post("/api/v1/variants/", {"product": product["id"], "price": "99.00"}, format="json").json()
    assert len(results(public.get("/api/v1/products/"))) == 1
    # Removing the only variant hides it but keeps the row for past orders.
    assert admin.delete(f"/api/v1/variants/{variant['id']}/").status_code == 204
    assert Variant.objects.get().is_active is False
    assert results(public.get("/api/v1/products/")) == []


def test_removed_product_is_hidden_but_kept(admin):
    add_product(admin)
    assert admin.delete("/api/v1/products/masala-tea/").status_code == 204
    assert Product.objects.get().is_active is False
    public = APIClient()
    assert public.get("/api/v1/products/masala-tea/").status_code == 404
    admin.patch("/api/v1/products/masala-tea/", {"is_active": True}, format="json")
    assert public.get("/api/v1/products/masala-tea/").status_code == 200


def test_category_filter_includes_sub_categories(admin):
    tea = admin.post("/api/v1/categories/", {"name": "Tea"}, format="json").json()
    green = admin.post("/api/v1/categories/", {"name": "Green Tea", "parent": tea["id"]}, format="json").json()
    snacks = admin.post("/api/v1/categories/", {"name": "Snacks"}, format="json").json()
    add_product(admin, "Sencha", green["id"])
    add_product(admin, "Murukku", snacks["id"])

    public = APIClient()
    assert [p["name"] for p in results(public.get("/api/v1/products/?category=tea"))] == ["Sencha"]
    assert [c["slug"] for c in public.get("/api/v1/categories/").json()] == ["green-tea", "snacks", "tea"]
    # A category can't be moved inside its own child.
    res = admin.patch("/api/v1/categories/tea/", {"parent": green["id"]}, format="json")
    assert res.status_code == 400


def test_hiding_a_category_hides_its_products_from_customers(admin):
    rings = admin.post("/api/v1/categories/", {"name": "Rings"}, format="json").json()
    add_product(admin, "Gold ring", rings["id"])
    add_product(admin, "Loose item")  # on no shelf: stays visible

    public = APIClient()
    assert {p["name"] for p in results(public.get("/api/v1/products/"))} == {"Gold ring", "Loose item"}
    assert admin.delete("/api/v1/categories/rings/").status_code == 204
    assert [p["name"] for p in results(public.get("/api/v1/products/"))] == ["Loose item"]
    assert public.get("/api/v1/products/gold-ring/").status_code == 404
    # Staff still see it, to bring the shelf back.
    assert len(results(admin.get("/api/v1/products/"))) == 2
    admin.patch("/api/v1/categories/rings/", {"is_active": True}, format="json")
    assert len(results(public.get("/api/v1/products/"))) == 2


def test_price_stock_search_and_sort(admin):
    add_product(admin, "Masala Tea", variants=[{"price": "180.00", "stock": 5, "sku": "TEA-250"}])
    add_product(admin, "Filter Coffee", variants=[{"price": "420.00", "stock": 0}])
    public = APIClient()

    def names(query):
        return [p["name"] for p in results(public.get(f"/api/v1/products/?{query}"))]

    assert names("min_price=200") == ["Filter Coffee"]
    assert names("max_price=200") == ["Masala Tea"]
    assert names("in_stock=true") == ["Masala Tea"]
    assert names("search=TEA-250") == ["Masala Tea"]
    assert names("ordering=-price_from") == ["Filter Coffee", "Masala Tea"]


def test_products_are_paged(admin):
    for i in range(3):
        add_product(admin, f"Tea {i}")
    page = APIClient().get("/api/v1/products/?page_size=2").json()
    assert page["count"] == 3 and len(page["results"]) == 2 and page["next"]


def test_image_upload_and_delete(admin):
    product = add_product(admin)
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), "red").save(buf, "PNG")
    upload = SimpleUploadedFile("tea.png", buf.getvalue(), content_type="image/png")
    res = admin.post("/api/v1/product-images/", {"product": product["id"], "image": upload, "alt": "Tea pack"})
    assert res.status_code == 201, res.json()
    image = ProductImage.objects.get()
    assert image.image.storage.exists(image.image.name)

    assert APIClient().get("/api/v1/products/masala-tea/").json()["images"][0]["alt"] == "Tea pack"
    assert admin.delete(f"/api/v1/product-images/{image.id}/").status_code == 204
    assert not image.image.storage.exists(image.image.name)


def test_only_staff_and_admins_change_the_catalog(admin):
    product = add_product(admin)
    customer = as_role(User.Role.CUSTOMER)
    assert APIClient().post("/api/v1/products/", {"name": "X"}, format="json").status_code == 401
    assert customer.post("/api/v1/products/", {"name": "X"}, format="json").status_code == 403
    assert customer.post("/api/v1/categories/", {"name": "X"}, format="json").status_code == 403
    assert customer.get("/api/v1/variants/").status_code == 403
    assert as_role(User.Role.STAFF).post("/api/v1/variants/", {"product": product["id"], "price": "1"},
                                         format="json").status_code == 201


def test_variant_price_rules_and_unique_sku(admin):
    product = add_product(admin, variants=[{"price": "100.00", "sku": "A1"}])
    post = lambda data: admin.post("/api/v1/variants/", {"product": product["id"], **data}, format="json")
    assert "mrp" in post({"price": "250.00", "mrp": "200.00"}).json()
    assert "price" in post({"price": "0"}).json()
    assert "sku" in post({"price": "10.00", "sku": "A1"}).json()
    # Blank SKUs don't clash with each other.
    assert post({"price": "10.00", "sku": ""}).status_code == 201
    assert post({"price": "10.00", "sku": ""}).status_code == 201
