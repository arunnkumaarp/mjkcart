from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from accounts.models import Address, User
from catalog.models import Product, Variant
from core.models import ShopSettings
from orders.models import Order


@pytest.fixture
def shop(db):
    shop = ShopSettings.load()
    shop.upi_id = "mjkcart@upi"
    shop.shipping_flat, shop.free_shipping_above = Decimal("99"), Decimal("999")
    shop.cod_fee, shop.cod_max_order = Decimal("30"), Decimal("1000")
    shop.save()
    return shop


@pytest.fixture
def ravi(db):
    return User.objects.create(username="ravi@x.com", email="ravi@x.com")


@pytest.fixture
def shopper(ravi):
    client = APIClient()
    client.force_authenticate(ravi)
    return client


@pytest.fixture
def address(ravi):
    return Address.objects.create(user=ravi, name="Ravi", phone="9876543210", line1="12 Main Road",
                                  city="Chennai", state="Tamil Nadu", pincode="600001")


@pytest.fixture
def tea(db):
    product = Product.objects.create(name="Masala Tea")
    return Variant.objects.create(product=product, size="250g", sku="TEA-250", price="180.00", stock=10)


def fill_cart(client, variant, quantity):
    assert client.post("/api/v1/cart/items/", {"variant": variant.id, "quantity": quantity},
                       format="json").status_code == 201


def checkout(client, address, method, url="/api/v1/orders/"):
    return client.post(url, {"address": address.id, "payment_method": method}, format="json")


def test_quote_adds_shipping_and_cod_fee(shop, shopper, address, tea):
    fill_cart(shopper, tea, 2)
    q = checkout(shopper, address, "cod", "/api/v1/checkout/quote/").json()
    assert q == {"subtotal": "360.00", "coupon_code": "", "discount": "0.00", "shipping_fee": "99.00",
                 "cod_fee": "30.00", "total": "489.00", "problems": []}
    q = checkout(shopper, address, "upi", "/api/v1/checkout/quote/").json()
    assert q["cod_fee"] == "0.00" and q["total"] == "459.00"


def test_free_shipping_above_threshold_and_cod_cap(shop, shopper, address, tea):
    fill_cart(shopper, tea, 6)  # ₹1080
    q = checkout(shopper, address, "cod", "/api/v1/checkout/quote/").json()
    assert q["shipping_fee"] == "0.00"
    assert q["problems"] == ["Cash on delivery is available for orders up to ₹1000."]
    assert checkout(shopper, address, "upi", "/api/v1/checkout/quote/").json()["problems"] == []


def test_cod_order_is_confirmed_takes_stock_and_empties_cart(shop, shopper, address, tea):
    fill_cart(shopper, tea, 2)
    res = checkout(shopper, address, "cod")
    assert res.status_code == 201, res.json()
    order = res.json()
    assert order["number"].startswith("MJK") and order["status"] == "confirmed"
    assert order["total"] == "489.00" and order["ship_pincode"] == "600001"
    assert order["items"][0] == {**order["items"][0], "product_name": "Masala Tea", "label": "250g",
                                 "sku": "TEA-250", "price": "180.00", "quantity": 2, "line_total": "360.00"}

    tea.refresh_from_db()
    assert tea.stock == 8
    assert shopper.get("/api/v1/cart/").json()["items"] == []
    assert [o["number"] for o in shopper.get("/api/v1/orders/").json()] == [order["number"]]
    assert shopper.get(f"/api/v1/orders/{order['number']}/").json()["status_label"] == "Confirmed"


def test_upi_order_waits_for_payment(shop, shopper, address, tea):
    fill_cart(shopper, tea, 1)
    order = checkout(shopper, address, "upi").json()
    assert order["status"] == "payment_pending" and order["cod_fee"] == "0.00"


def test_order_keeps_its_prices_when_the_product_changes(shop, shopper, address, tea):
    fill_cart(shopper, tea, 1)
    number = checkout(shopper, address, "upi").json()["number"]
    Variant.objects.filter(pk=tea.pk).update(price="250.00")
    Product.objects.filter(pk=tea.product_id).update(name="Renamed")
    item = shopper.get(f"/api/v1/orders/{number}/").json()["items"][0]
    assert item["price"] == "180.00" and item["product_name"] == "Masala Tea"


def test_refused_when_stock_ran_out_or_cart_empty(shop, shopper, address, tea):
    assert checkout(shopper, address, "upi").json()["problems"] == ["Your cart is empty."]
    fill_cart(shopper, tea, 3)
    Variant.objects.filter(pk=tea.pk).update(stock=2)
    res = checkout(shopper, address, "upi")
    assert res.status_code == 400 and "out of stock" in res.json()["problems"][0]
    assert Order.objects.count() == 0
    tea.refresh_from_db()
    assert tea.stock == 2


def test_cannot_use_someone_elses_address_or_order(shop, shopper, address, tea):
    other = APIClient()
    other.force_authenticate(User.objects.create(username="b@x.com", email="b@x.com"))
    fill_cart(other, tea, 1)
    assert "address" in checkout(other, address, "upi").json()

    fill_cart(shopper, tea, 1)
    number = checkout(shopper, address, "upi").json()["number"]
    assert other.get(f"/api/v1/orders/{number}/").status_code == 404
    assert other.get("/api/v1/orders/").json() == []
