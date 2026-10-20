import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import Address, User
from catalog.models import Product, Variant
from core.models import ShopSettings


@pytest.fixture(autouse=True)
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def setup(db):
    shop = ShopSettings.load()
    shop.upi_id = "mjkcart@upi"
    shop.save()
    ravi = User.objects.create(username="ravi@x.com", email="ravi@x.com")
    customer = APIClient()
    customer.force_authenticate(ravi)
    staff = APIClient()
    staff.force_authenticate(User.objects.create(username="s@x.com", email="s@x.com", role=User.Role.STAFF))
    address = Address.objects.create(user=ravi, name="Ravi", phone="9876543210", line1="12 Main Road",
                                     city="Chennai", state="Tamil Nadu", pincode="600001")
    tea = Variant.objects.create(product=Product.objects.create(name="Masala Tea"), price="180.00", stock=10)
    return customer, staff, address, tea


def place(customer, address, tea, method="upi"):
    customer.post("/api/v1/cart/items/", {"variant": tea.id, "quantity": 1}, format="json")
    return customer.post("/api/v1/orders/", {"address": address.id, "payment_method": method},
                         format="json").json()["number"]


def pay(customer, number, **data):
    return customer.post(f"/api/v1/orders/{number}/payment/", data)


def screenshot():
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), "green").save(buf, "PNG")
    return SimpleUploadedFile("paid.png", buf.getvalue(), content_type="image/png")


def queue(staff):
    return staff.get("/api/v1/staff/payments/?status=submitted").json()["results"]


def test_customer_sends_reference_and_staff_verify(setup):
    customer, staff, address, tea = setup
    number = place(customer, address, tea)
    order = pay(customer, number, reference="412345678901").json()
    assert order["payment"]["status"] == "submitted" and order["status"] == "payment_pending"

    proof = queue(staff)[0]
    assert proof["order_number"] == number and proof["order_total"] == "279.00"
    assert staff.post(f"/api/v1/staff/payments/{proof['id']}/verify/").status_code == 200

    order = customer.get(f"/api/v1/orders/{number}/").json()
    assert order["status"] == "confirmed" and order["payment"]["status"] == "verified"
    assert order["events"][-1]["note"] == "UPI payment 412345678901 verified"
    assert queue(staff) == []


def test_rejected_payment_can_be_sent_again(setup):
    customer, staff, address, tea = setup
    number = place(customer, address, tea)
    assert pay(customer, number, screenshot=screenshot()).status_code == 201
    assert pay(customer, number, reference="412345678901").json() == {"detail": "We're already checking your payment."}

    proof_id = queue(staff)[0]["id"]
    res = staff.post(f"/api/v1/staff/payments/{proof_id}/reject/", {"reason": "Not received"}, format="json")
    assert res.json()["status"] == "rejected"
    order = customer.get(f"/api/v1/orders/{number}/").json()
    assert order["status"] == "payment_pending" and order["payment"]["reject_reason"] == "Not received"

    assert pay(customer, number, reference="412345678901").status_code == 201
    assert staff.post(f"/api/v1/staff/payments/{proof_id}/verify/").status_code == 400


def test_needs_reference_or_screenshot_and_reference_used_once(setup):
    customer, staff, address, tea = setup
    first, second = place(customer, address, tea), place(customer, address, tea)
    assert pay(customer, first).status_code == 400
    assert "reference" in pay(customer, first, reference="12-34").json()
    pay(customer, first, reference="abc123456789")
    res = pay(customer, second, reference="ABC123456789")
    assert res.json() == {"reference": ["This reference was already used for another payment."]}


def test_only_upi_orders_waiting_for_payment_accept_proof(setup):
    customer, staff, address, tea = setup
    cod = place(customer, address, tea, "cod")
    assert pay(customer, cod, reference="412345678901").status_code == 400


def test_verifying_after_customer_cancelled_is_refused(setup):
    customer, staff, address, tea = setup
    number = place(customer, address, tea)
    pay(customer, number, reference="412345678901")
    customer.post(f"/api/v1/orders/{number}/cancel/", format="json")
    res = staff.post(f"/api/v1/staff/payments/{queue(staff)[0]['id']}/verify/")
    assert res.status_code == 400 and "cancelled" in res.json()["detail"]


def test_payment_queue_is_staff_only(setup):
    customer, staff, address, tea = setup
    assert customer.get("/api/v1/staff/payments/").status_code == 403
    other = APIClient()
    other.force_authenticate(User.objects.create(username="b@x.com", email="b@x.com"))
    assert pay(other, place(customer, address, tea), reference="412345678901").status_code == 404
