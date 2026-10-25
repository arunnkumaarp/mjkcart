from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from catalog.models import Category, Product, Variant
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


def test_sales_by_category(admin, ravi):
    rings = Category.objects.create(name="Rings")
    tea = Category.objects.create(name="Tea")
    ring = Variant.objects.create(product=Product.objects.create(name="Gold ring", category=rings), price="2000", stock=9)
    chai = Variant.objects.create(product=Product.objects.create(name="Chai", category=tea), price="180", stock=9)
    loose = Variant.objects.create(product=Product.objects.create(name="Loose"), price="50", stock=9)

    def sell(status, *lines):
        o = order(ravi, status, items=())
        for variant, qty in lines:
            OrderItem.objects.create(order=o, variant=variant, product_name=variant.product.name,
                                     price=variant.price, quantity=qty)

    sell(S.CONFIRMED, (ring, 1), (chai, 2))
    sell(S.DELIVERED, (chai, 3), (loose, 1))
    sell(S.CANCELLED, (ring, 5))  # not a sale
    rows = admin.get("/api/v1/staff/reports/categories/").json()
    assert rows == [
        {"category": "Rings", "orders": 1, "quantity": 1, "revenue": "2000.00"},
        {"category": "Tea", "orders": 2, "quantity": 5, "revenue": "900.00"},
        {"category": "No shelf", "orders": 1, "quantity": 1, "revenue": "50.00"},
    ]


def test_sales_by_product_lists_every_product(admin, ravi):
    rings = Category.objects.create(name="Rings", is_active=False)
    tea = Category.objects.create(name="Tea")
    ring = Variant.objects.create(product=Product.objects.create(name="Gold ring", category=rings), price="2000", stock=4)
    chai = Product.objects.create(name="Chai", category=tea)
    small = Variant.objects.create(product=chai, size="100g", price="100", stock=5)
    Variant.objects.create(product=chai, size="250g", price="180", stock=7)
    Variant.objects.create(product=chai, size="1kg", price="600", stock=50, is_active=False)  # not on sale
    Product.objects.create(name="Biscuits", category=tea, is_active=False)                    # never sold

    def sell(status, *lines):
        o = order(ravi, status, items=())
        for variant, qty in lines:
            OrderItem.objects.create(order=o, variant=variant, product_name=variant.product.name,
                                     price=variant.price, quantity=qty)

    sell(S.CONFIRMED, (small, 2))
    sell(S.DELIVERED, (small, 1))
    sell(S.CANCELLED, (ring, 5))  # not a sale
    rows = admin.get("/api/v1/staff/reports/products/").json()
    assert [(r["name"], r["category"], r["shown"], r["stock"], r["orders"], r["quantity"], r["revenue"])
            for r in rows] == [
        ("Chai", "Tea", True, 12, 2, 3, "300.00"),
        ("Biscuits", "Tea", False, 0, 0, 0, "0.00"),
        ("Gold ring", "Rings", False, 4, 0, 0, "0.00"),
    ]


def test_buyers_list_ranks_by_spend_and_searches(admin, ravi):
    meena = User.objects.create(username="meena@x.com", email="meena@x.com", first_name="Meena", phone="9876500000")
    User.objects.create(username="new@x.com", email="new@x.com")  # signed up, never ordered
    order(ravi, S.DELIVERED)                    # 459
    order(meena, S.CONFIRMED)                   # 459
    order(meena, S.SHIPPED, shipping="0")       # 360
    order(meena, S.CANCELLED)                   # not counted
    order(ravi, S.PAYMENT_PENDING, "upi")       # waiting

    rows = admin.get("/api/v1/staff/reports/buyers/").json()["results"]
    assert [(r["email"], r["orders"], r["spent"], r["waiting_payment"]) for r in rows] == [
        ("meena@x.com", 2, "819.00", 0), ("ravi@x.com", 1, "459.00", 1), ("new@x.com", 0, "0.00", 0)]
    assert rows[0]["name"] == "Meena" and rows[2]["last_order"] is None
    # Admins don't appear as buyers.
    assert "o@x.com" not in [r["email"] for r in rows]
    for q in ("meena", "98765", "MEENA@X"):
        assert [r["email"] for r in admin.get(f"/api/v1/staff/reports/buyers/?q={q}").json()["results"]] == ["meena@x.com"]


def test_buyers_and_categories_are_admin_only(ravi):
    staff = APIClient()
    staff.force_authenticate(User.objects.create(username="s@x.com", email="s@x.com", role=User.Role.STAFF))
    for url in ("/api/v1/staff/reports/buyers/", "/api/v1/staff/reports/categories/",
                "/api/v1/staff/reports/products/"):
        assert staff.get(url).status_code == 403
        assert APIClient().get(url).status_code == 401
