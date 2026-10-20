import pytest
from rest_framework.test import APIClient

from accounts.models import User
from catalog.models import Product, Variant


@pytest.fixture
def shopper(db):
    client = APIClient()
    client.force_authenticate(User.objects.create(username="ravi@x.com", email="ravi@x.com"))
    return client


@pytest.fixture
def tea(db):
    product = Product.objects.create(name="Masala Tea")
    return {
        "small": Variant.objects.create(product=product, size="250g", price="180.00", mrp="200.00", stock=5),
        "large": Variant.objects.create(product=product, size="500g", price="340.00", stock=2),
    }


def add(client, variant, quantity=1):
    return client.post("/api/v1/cart/items/", {"variant": variant.id, "quantity": quantity}, format="json")


def test_add_items_and_totals(shopper, tea):
    assert shopper.get("/api/v1/cart/").json()["items"] == []
    add(shopper, tea["small"], 2)
    cart = add(shopper, tea["large"]).json()
    assert cart["item_count"] == 3 and cart["subtotal"] == "700.00"
    first = cart["items"][0]
    assert first["product_name"] == "Masala Tea" and first["label"] == "250g" and first["line_total"] == "360.00"

    # Adding the same variant again increases its quantity instead of adding a row.
    cart = add(shopper, tea["small"]).json()
    assert len(cart["items"]) == 2 and cart["items"][0]["quantity"] == 3


def test_stock_is_checked_on_add_and_change(shopper, tea):
    assert add(shopper, tea["large"], 3).json() == {"quantity": ["Only 2 left."]}
    item_id = add(shopper, tea["large"], 2).json()["items"][0]["id"]
    assert add(shopper, tea["large"]).status_code == 400

    url = f"/api/v1/cart/items/{item_id}/"
    assert shopper.patch(url, {"quantity": 5}, format="json").status_code == 400
    assert shopper.patch(url, {"quantity": 1}, format="json").json()["subtotal"] == "340.00"
    assert shopper.patch(url, {"quantity": 0}, format="json").status_code == 400

    Variant.objects.filter(pk=tea["small"].pk).update(stock=0)
    assert add(shopper, tea["small"]).json() == {"quantity": ["Out of stock."]}
    Variant.objects.filter(pk=tea["small"].pk).update(stock=5, is_active=False)
    assert add(shopper, tea["small"]).json() == {"quantity": ["This item is no longer available."]}


def test_items_that_become_unavailable_drop_out_of_the_subtotal(shopper, tea):
    add(shopper, tea["small"], 2)
    add(shopper, tea["large"])
    Variant.objects.filter(pk=tea["large"].pk).update(stock=0)
    cart = shopper.get("/api/v1/cart/").json()
    assert [i["available"] for i in cart["items"]] == [True, False]
    assert cart["subtotal"] == "360.00"


def test_remove_item_and_empty_cart(shopper, tea):
    cart = add(shopper, tea["small"]).json()
    add(shopper, tea["large"])
    cart = shopper.delete(f"/api/v1/cart/items/{cart['items'][0]['id']}/").json()
    assert [i["label"] for i in cart["items"]] == ["500g"]
    assert shopper.delete("/api/v1/cart/").json()["items"] == []


def test_carts_are_private(shopper, tea):
    item_id = add(shopper, tea["small"]).json()["items"][0]["id"]
    other = APIClient()
    other.force_authenticate(User.objects.create(username="b@x.com", email="b@x.com"))
    assert other.get("/api/v1/cart/").json()["items"] == []
    assert other.delete(f"/api/v1/cart/items/{item_id}/").status_code == 404
    assert APIClient().get("/api/v1/cart/").status_code == 401


def test_merge_guest_cart_after_login(shopper, tea):
    add(shopper, tea["small"], 4)
    gone = Variant.objects.create(product=tea["small"].product, size="1kg", price="600.00", stock=0)
    cart = shopper.post("/api/v1/cart/merge/", {"items": [
        {"variant": tea["small"].id, "quantity": 3},
        {"variant": tea["large"].id, "quantity": 1},
        {"variant": gone.id, "quantity": 1},
    ]}, format="json").json()
    # 4 + 3 is capped at the 5 in stock; the out-of-stock one is skipped.
    assert [(i["label"], i["quantity"]) for i in cart["items"]] == [("250g", 5), ("500g", 1)]
