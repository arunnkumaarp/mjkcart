from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Address, User
from catalog.models import Product, Variant
from core.models import ShopSettings
from offers.models import Coupon


@pytest.fixture
def setup(db):
    ShopSettings.objects.update_or_create(pk=1, defaults={"upi_id": "mjkcart@upi"})
    ravi = User.objects.create(username="ravi@x.com", email="ravi@x.com")
    customer = APIClient()
    customer.force_authenticate(ravi)
    address = Address.objects.create(user=ravi, name="Ravi", phone="9876543210", line1="12 Main Road",
                                     city="Chennai", state="Tamil Nadu", pincode="600001")
    tea = Variant.objects.create(product=Product.objects.create(name="Masala Tea"), price="250.00", stock=50)
    return customer, address, tea


def shopper(email):
    user = User.objects.create(username=email, email=email)
    client = APIClient()
    client.force_authenticate(user)
    return client, Address.objects.create(user=user, name="B", phone="9876543211", line1="1 Road", city="Delhi",
                                          state="Delhi", pincode="110001")


def fill(client, tea, quantity):
    client.delete("/api/v1/cart/")
    client.post("/api/v1/cart/items/", {"variant": tea.id, "quantity": quantity}, format="json")


def quote(client, address, coupon, method="upi"):
    return client.post("/api/v1/checkout/quote/", {"address": address.id, "payment_method": method,
                                                    "coupon": coupon}, format="json").json()


def place(client, address, coupon, method="upi"):
    return client.post("/api/v1/orders/", {"address": address.id, "payment_method": method, "coupon": coupon},
                       format="json")


def test_percent_coupon_with_cap(setup):
    customer, address, tea = setup
    Coupon.objects.create(code="tea10", kind="percent", value="10", max_discount="100")
    fill(customer, tea, 2)  # ₹500
    q = quote(customer, address, " Tea10 ")
    assert (q["coupon_code"], q["discount"], q["shipping_fee"], q["total"]) == ("TEA10", "50.00", "99.00", "549.00")
    fill(customer, tea, 8)  # ₹2000 → 10% is 200, capped at 100
    assert quote(customer, address, "TEA10")["discount"] == "100.00"


def test_flat_coupon_and_free_delivery_counts_after_discount(setup):
    customer, address, tea = setup
    Coupon.objects.create(code="FLAT100", kind="flat", value="100")
    fill(customer, tea, 4)  # ₹1000, but ₹900 after the coupon, so delivery is charged
    q = quote(customer, address, "FLAT100")
    assert (q["discount"], q["shipping_fee"], q["total"]) == ("100.00", "99.00", "999.00")


def test_order_keeps_coupon_and_discount(setup):
    customer, address, tea = setup
    Coupon.objects.create(code="TEA10", kind="percent", value="10")
    fill(customer, tea, 2)
    order = place(customer, address, "tea10").json()
    assert (order["coupon_code"], order["discount"], order["total"]) == ("TEA10", "50.00", "549.00")


def test_coupon_problems(setup):
    customer, address, tea = setup
    now = timezone.now()
    Coupon.objects.create(code="BIG", kind="flat", value="100", min_order="1000")
    Coupon.objects.create(code="OLD", kind="flat", value="50", ends_at=now - timedelta(days=1))
    Coupon.objects.create(code="SOON", kind="flat", value="50", starts_at=now + timedelta(days=1))
    Coupon.objects.create(code="OFF", kind="flat", value="50", is_active=False)
    fill(customer, tea, 2)
    assert quote(customer, address, "NOPE")["problems"] == ["Coupon NOPE doesn't exist."]
    assert quote(customer, address, "BIG")["problems"] == ["Add items worth ₹500 more to use BIG."]
    assert quote(customer, address, "OLD")["problems"] == ["Coupon OLD has expired."]
    assert quote(customer, address, "SOON")["problems"] == ["Coupon SOON isn't active yet."]
    assert quote(customer, address, "OFF")["problems"] == ["Coupon OFF has expired."]
    res = place(customer, address, "BIG")
    assert res.status_code == 400 and quote(customer, address, "BIG")["discount"] == "0.00"


def test_usage_limits_and_cancel_gives_use_back(setup):
    customer, address, tea = setup
    Coupon.objects.create(code="ONCE", kind="flat", value="20", per_customer_limit=1, usage_limit=2)
    fill(customer, tea, 1)
    number = place(customer, address, "ONCE").json()["number"]
    fill(customer, tea, 1)
    assert quote(customer, address, "ONCE")["problems"] == ["You've already used ONCE."]

    customer.post(f"/api/v1/orders/{number}/cancel/", format="json")
    assert quote(customer, address, "ONCE")["problems"] == []

    for email in ["a@x.com", "b@x.com"]:
        client, addr = shopper(email)
        fill(client, tea, 1)
        assert place(client, addr, "ONCE").status_code == 201
    client, addr = shopper("c@x.com")
    fill(client, tea, 1)
    assert quote(client, addr, "ONCE")["problems"] == ["Coupon ONCE has been fully used."]


def test_only_admins_manage_coupons(setup):
    admin, staff = APIClient(), APIClient()
    admin.force_authenticate(User.objects.create(username="o@x.com", email="o@x.com", role=User.Role.ADMIN))
    staff.force_authenticate(User.objects.create(username="s@x.com", email="s@x.com", role=User.Role.STAFF))
    coupon = {"code": "diwali", "kind": "percent", "value": "15", "max_discount": "300"}
    assert staff.post("/api/v1/staff/coupons/", coupon, format="json").status_code == 403

    res = admin.post("/api/v1/staff/coupons/", coupon, format="json")
    assert res.status_code == 201 and res.json()["code"] == "DIWALI" and res.json()["times_used"] == 0
    assert "code" in admin.post("/api/v1/staff/coupons/", coupon, format="json").json()
    assert "value" in admin.post("/api/v1/staff/coupons/", {**coupon, "code": "X", "value": "150"}, format="json").json()
    assert admin.delete(f"/api/v1/staff/coupons/{res.json()['id']}/").status_code == 204
    assert Coupon.objects.get().is_active is False
