from unittest import mock

import pytest
from django.core import mail
from rest_framework.test import APIClient

from accounts.models import Address, User
from catalog.models import Product, Variant
from core.models import ShopSettings
from orders.models import Courier


@pytest.fixture
def setup(db, settings):
    settings.FRONTEND_URL = "https://mjkcart.in"
    shop = ShopSettings.load()
    shop.upi_id, shop.support_email, shop.support_phone = "mjkcart@upi", "shop@mjkcart.in", "9876500000"
    shop.save()
    ravi = User.objects.create(username="ravi@x.com", email="ravi@x.com")
    customer = APIClient()
    customer.force_authenticate(ravi)
    staff = APIClient()
    staff.force_authenticate(User.objects.create(username="s@x.com", email="s@x.com", role=User.Role.STAFF))
    address = Address.objects.create(user=ravi, name="Ravi", phone="9876543210", line1="12 Main Road",
                                     city="Chennai", state="Tamil Nadu", pincode="600001")
    tea = Variant.objects.create(product=Product.objects.create(name="Masala Tea"), size="250g", price="180.00",
                                 stock=10)
    return customer, staff, address, tea


@pytest.fixture
def emails(django_capture_on_commit_callbacks):
    """Run the after-commit email callbacks and return what was sent as (to, subject, body)."""
    def run(action):
        mail.outbox.clear()
        with django_capture_on_commit_callbacks(execute=True):
            result = action()
        return result, [(m.to[0], m.subject, m.body) for m in mail.outbox]
    return run


def place(customer, address, tea, method):
    customer.post("/api/v1/cart/items/", {"variant": tea.id, "quantity": 2}, format="json")
    return customer.post("/api/v1/orders/", {"address": address.id, "payment_method": method},
                         format="json").json()["number"]


def move(staff, number, status, note=""):
    data = {"status": status, "note": note}
    if status == "shipped":
        data |= {"courier": Courier.objects.get(name="DHL").id, "tracking_number": "1234567890"}
    return staff.post(f"/api/v1/staff/orders/{number}/status/", data, format="json")


def test_cod_order_emails_customer_and_shop(setup, emails):
    customer, staff, address, tea = setup
    number, sent = emails(lambda: place(customer, address, tea, "cod"))
    (to, subject, body), (shop_to, shop_subject, _) = sent
    assert to == "ravi@x.com" and subject == f"Order {number} confirmed · MJK Cart"
    assert "2 × Masala Tea (250g)  ₹360.00" in body and "Total ₹459.00" in body
    assert f"https://mjkcart.in/orders/{number}" in body and "9876500000" in body
    assert shop_to == "shop@mjkcart.in" and shop_subject == f"New order {number} · ₹459.00"


def test_upi_flow_emails(setup, emails):
    customer, staff, address, tea = setup
    number, sent = emails(lambda: place(customer, address, tea, "upi"))
    assert sent[0][1].startswith("Pay ₹459.00 to confirm") and "UPI ID: mjkcart@upi" in sent[0][2]

    _, sent = emails(lambda: customer.post(f"/api/v1/orders/{number}/payment/", {"reference": "412345678901"}))
    assert sent == [("shop@mjkcart.in", f"Check UPI payment for {number}", mock.ANY)]

    proof = staff.get("/api/v1/staff/payments/").json()["results"][0]["id"]
    _, sent = emails(lambda: staff.post(f"/api/v1/staff/payments/{proof}/reject/", {"reason": "Not received"},
                                        format="json"))
    assert sent[0][0] == "ravi@x.com" and "Reason: Not received" in sent[0][2]

    customer.post(f"/api/v1/orders/{number}/payment/", {"reference": "412345678902"})
    proof = staff.get("/api/v1/staff/payments/?status=submitted").json()["results"][0]["id"]
    _, sent = emails(lambda: staff.post(f"/api/v1/staff/payments/{proof}/verify/"))
    assert [s[1] for s in sent] == [f"Payment received, order {number} confirmed · MJK Cart"]


def test_status_emails_skip_packing(setup, emails):
    customer, staff, address, tea = setup
    number = place(customer, address, tea, "cod")
    subjects = {}
    for step in ["packed", "shipped", "delivered"]:
        _, sent = emails(lambda: move(staff, number, step))
        subjects[step] = [s[1] for s in sent]
    assert subjects == {"packed": [], "shipped": [f"Order {number} is on its way · MJK Cart"],
                        "delivered": [f"Order {number} delivered · MJK Cart"]}


def test_failed_email_does_not_block_the_order(setup, emails):
    customer, staff, address, tea = setup
    with mock.patch("orders.emails.send_mail", side_effect=OSError("SMTP down")):
        number, sent = emails(lambda: place(customer, address, tea, "cod"))
    assert number.startswith("MJK") and sent == []
    assert customer.get(f"/api/v1/orders/{number}/").json()["status"] == "confirmed"
