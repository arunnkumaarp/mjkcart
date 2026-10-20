from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from catalog.models import Product, Variant
from orders.models import Order, OrderItem, PaymentProof

S = Order.Status


@pytest.fixture
def admin(db):
    client = APIClient()
    client.force_authenticate(User.objects.create(username="o@x.com", email="o@x.com", role=User.Role.ADMIN))
    return client


@pytest.fixture
def ravi(db):
    return User.objects.create(username="ravi@x.com", email="ravi@x.com")


def order(user, status, method="cod", items=(("Masala Tea", "250g", "180.00", 2),), days_ago=0, discount="0",
          shipping="99.00"):
    subtotal = sum(Decimal(p) * q for _, _, p, q in items)
    o = Order.objects.create(
        user=user, status=status, payment_method=method, ship_name="R", ship_phone="9876543210", ship_line1="x",
        ship_city="Chennai", ship_state="TN", ship_pincode="600001", subtotal=subtotal, discount=Decimal(discount),
        shipping_fee=Decimal(shipping), cod_fee=Decimal("0"), total=subtotal - Decimal(discount) + Decimal(shipping))
    o.number = f"MJK{o.pk:06d}"
    o.save()
    if days_ago:
        Order.objects.filter(pk=o.pk).update(created_at=timezone.now() - timedelta(days=days_ago))
    for name, label, price, qty in items:
        OrderItem.objects.create(order=o, product_name=name, label=label, price=price, quantity=qty)
    return o


def test_summary_counts_only_sold_orders(admin, ravi):
    order(ravi, S.CONFIRMED, "cod")                                    # 459
    order(ravi, S.DELIVERED, "upi", discount="50")                     # 409
    order(ravi, S.PACKED, "upi", items=(("Filter Coffee", "", "420.00", 1),), shipping="0")  # 420
    order(ravi, S.PAYMENT_PENDING, "upi")
    order(ravi, S.CANCELLED, "cod")
    order(ravi, S.RETURNED, "cod")
    order(ravi, S.DELIVERED, "cod", days_ago=40)                       # outside the default 30 days
    PaymentProof.objects.create(order=Order.objects.get(status=S.PAYMENT_PENDING), reference="412345678901")

    r = admin.get("/api/v1/staff/reports/summary/").json()
    assert (r["orders"], r["revenue"], r["items_sold"], r["average_order"]) == (3, "1288.00", 5, "429.33")
    assert r["discounts"] == "50.00"
    assert r["cod"] == {"orders": 1, "revenue": "459.00"} and r["upi"] == {"orders": 2, "revenue": "829.00"}
    assert (r["cancelled"], r["returned"]) == (1, 1)
    assert (r["payments_to_check"], r["to_pack"], r["to_ship"]) == (1, 1, 1)


def test_daily_has_a_row_for_every_day(admin, ravi):
    order(ravi, S.CONFIRMED, days_ago=2)
    order(ravi, S.CONFIRMED, days_ago=2)
    today = timezone.localdate()
    rows = admin.get(f"/api/v1/staff/reports/daily/?date_from={today - timedelta(days=3)}&date_to={today}").json()
    assert [r["orders"] for r in rows] == [0, 2, 0, 0]
    assert rows[1] == {"date": str(today - timedelta(days=2)), "orders": 2, "revenue": "918.00"}


def test_period_validation(admin):
    assert admin.get("/api/v1/staff/reports/summary/?date_from=2026-02-01&date_to=2026-01-01").status_code == 400
    assert admin.get("/api/v1/staff/reports/summary/?date_from=2024-01-01&date_to=2026-01-01").status_code == 400
    assert admin.get("/api/v1/staff/reports/summary/?date_from=nope").status_code == 400


def test_top_products(admin, ravi):
    order(ravi, S.CONFIRMED, items=(("Masala Tea", "250g", "180.00", 3), ("Filter Coffee", "", "420.00", 1)))
    order(ravi, S.SHIPPED, items=(("Masala Tea", "250g", "180.00", 2),))
    order(ravi, S.CANCELLED, items=(("Filter Coffee", "", "420.00", 9),))
    rows = admin.get("/api/v1/staff/reports/top-products/?limit=5").json()
    assert rows == [{"product_name": "Masala Tea", "label": "250g", "quantity": 5, "revenue": "900.00"},
                    {"product_name": "Filter Coffee", "label": "", "quantity": 1, "revenue": "420.00"}]


def test_low_stock_for_staff(db):
    staff = APIClient()
    staff.force_authenticate(User.objects.create(username="s@x.com", email="s@x.com", role=User.Role.STAFF))
    tea = Product.objects.create(name="Masala Tea")
    Variant.objects.create(product=tea, size="250g", price="180", stock=3)
    Variant.objects.create(product=tea, size="500g", price="340", stock=0)
    Variant.objects.create(product=tea, size="1kg", price="600", stock=20)
    Variant.objects.create(product=tea, size="2kg", price="900", stock=1, is_active=False)
    rows = staff.get("/api/v1/staff/reports/low-stock/").json()
    assert [(r["label"], r["stock"]) for r in rows] == [("500g", 0), ("250g", 3)]
    assert len(staff.get("/api/v1/staff/reports/low-stock/?threshold=0").json()) == 1


def test_money_reports_are_admin_only(db, ravi):
    staff = APIClient()
    staff.force_authenticate(User.objects.create(username="s@x.com", email="s@x.com", role=User.Role.STAFF))
    for path in ["summary", "daily", "top-products"]:
        assert staff.get(f"/api/v1/staff/reports/{path}/").status_code == 403
    customer = APIClient()
    customer.force_authenticate(ravi)
    assert customer.get("/api/v1/staff/reports/low-stock/").status_code == 403
