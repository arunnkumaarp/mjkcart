import pytest
from django.core import mail
from rest_framework.test import APIClient

from accounts.models import Address, User
from catalog.models import Product, Variant
from core.models import ShopSettings
from orders.models import Courier


@pytest.fixture
def setup(db):
    ShopSettings.objects.update_or_create(pk=1, defaults={"upi_id": "mjkcart@upi", "support_phone": "9876500000"})
    ravi = User.objects.create(username="ravi@x.com", email="ravi@x.com")
    customer = APIClient()
    customer.force_authenticate(ravi)
    staff = APIClient()
    staff.force_authenticate(User.objects.create(username="s@x.com", email="s@x.com", role=User.Role.STAFF))
    address = Address.objects.create(user=ravi, name="Ravi Kumar", phone="9876543210", line1="12 Main Road",
                                     city="Chennai", state="Tamil Nadu", pincode="600001")
    tea = Variant.objects.create(product=Product.objects.create(name="Masala Tea"), size="250g", sku="TEA-250",
                                 price="180.00", stock=10, weight_grams=270)
    return customer, staff, address, tea


def place(customer, address, tea, method="cod"):
    customer.post("/api/v1/cart/items/", {"variant": tea.id, "quantity": 2}, format="json")
    number = customer.post("/api/v1/orders/", {"address": address.id, "payment_method": method},
                           format="json").json()["number"]
    return number


def status(staff, number, **data):
    return staff.post(f"/api/v1/staff/orders/{number}/status/", data, format="json")


def test_couriers_are_listed_for_staff(setup):
    customer, staff, *_ = setup
    assert [c["name"] for c in staff.get("/api/v1/staff/couriers/").json()] == ["DHL", "The Professional Couriers"]
    assert customer.get("/api/v1/staff/couriers/").status_code == 403


def test_shipping_needs_courier_and_tracking_number(setup, django_capture_on_commit_callbacks):
    customer, staff, address, tea = setup
    number = place(customer, address, tea)
    status(staff, number, status="packed")
    res = status(staff, number, status="shipped")
    assert res.json() == {"detail": "Add the courier and tracking number to mark the order shipped."}

    dhl = Courier.objects.get(name="DHL")
    mail.outbox.clear()
    with django_capture_on_commit_callbacks(execute=True):
        res = status(staff, number, status="shipped", courier=dhl.id, tracking_number=" 1234567890 ")
    assert res.status_code == 200

    order = customer.get(f"/api/v1/orders/{number}/").json()
    assert order["courier_name"] == "DHL" and order["tracking_number"] == "1234567890"
    assert order["tracking_url"].endswith("tracking-id=1234567890")
    body = mail.outbox[0].body
    assert "Courier: DHL" in body and "Tracking number: 1234567890" in body and order["tracking_url"] in body


def test_order_without_shipping_has_no_tracking(setup):
    customer, staff, address, tea = setup
    order = customer.get(f"/api/v1/orders/{place(customer, address, tea)}/").json()
    assert order["courier_name"] is None and order["tracking_url"] == ""


def test_slips_print_label_and_packing_list(setup):
    customer, staff, address, tea = setup
    cod, upi = place(customer, address, tea, "cod"), place(customer, address, tea, "upi")
    res = staff.get(f"/api/v1/staff/orders/slips/?numbers={cod},{upi}")
    assert res.status_code == 200 and res["Content-Type"].startswith("text/html")
    html = res.content.decode()
    assert html.count('class="order"') == 2
    assert "Ravi Kumar" in html and "600001" in html and "9876500000" in html
    assert "Masala Tea (250g)" in html and "TEA-250" in html and "540 g" in html
    assert "COD ₹459.00" in html and "PREPAID" in html


def test_slips_are_staff_only_and_need_numbers(setup):
    customer, staff, address, tea = setup
    number = place(customer, address, tea)
    assert customer.get(f"/api/v1/staff/orders/slips/?numbers={number}").status_code == 403
    assert staff.get("/api/v1/staff/orders/slips/").status_code == 404
