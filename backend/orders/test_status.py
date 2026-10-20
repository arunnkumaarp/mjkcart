import pytest
from rest_framework.test import APIClient

from accounts.models import Address, User
from catalog.models import Product, Variant
from core.models import ShopSettings
from orders.models import Courier


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


def place(customer, address, tea, method="cod", quantity=2):
    customer.post("/api/v1/cart/items/", {"variant": tea.id, "quantity": quantity}, format="json")
    return customer.post("/api/v1/orders/", {"address": address.id, "payment_method": method}, format="json").json()


def move(staff, number, status, note=""):
    data = {"status": status, "note": note}
    if status == "shipped":
        data |= {"courier": Courier.objects.get(name="DHL").id, "tracking_number": "1234567890"}
    return staff.post(f"/api/v1/staff/orders/{number}/status/", data, format="json")


def test_staff_move_order_to_delivered_and_customer_sees_timeline(setup):
    customer, staff, address, tea = setup
    number = place(customer, address, tea)["number"]
    assert staff.get(f"/api/v1/staff/orders/{number}/").json()["next_statuses"] == ["packed", "cancelled"]

    for step in ["packed", "shipped", "delivered"]:
        assert move(staff, number, step).status_code == 200
    order = customer.get(f"/api/v1/orders/{number}/").json()
    assert [e["status"] for e in order["events"]] == ["confirmed", "packed", "shipped", "delivered"]
    assert order["can_cancel"] is False


def test_steps_cannot_be_skipped_or_undone(setup):
    customer, staff, address, tea = setup
    number = place(customer, address, tea)["number"]
    res = move(staff, number, "delivered")
    assert res.status_code == 400 and res.json() == {"detail": "A confirmed order can't be marked delivered."}
    move(staff, number, "cancelled")
    assert move(staff, number, "confirmed").status_code == 400


def test_customer_cancels_before_packing_and_stock_returns(setup):
    customer, staff, address, tea = setup
    number = place(customer, address, tea)["number"]
    tea.refresh_from_db()
    assert tea.stock == 8

    res = customer.post(f"/api/v1/orders/{number}/cancel/", {"reason": "Ordered by mistake"}, format="json")
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    assert res.json()["events"][-1]["note"] == "Ordered by mistake"
    tea.refresh_from_db()
    assert tea.stock == 10


def test_customer_cannot_cancel_once_packed(setup):
    customer, staff, address, tea = setup
    number = place(customer, address, tea)["number"]
    move(staff, number, "packed")
    res = customer.post(f"/api/v1/orders/{number}/cancel/", format="json")
    assert res.status_code == 400 and "packed" in res.json()["detail"]


def test_return_does_not_restock(setup):
    customer, staff, address, tea = setup
    number = place(customer, address, tea)["number"]
    for step in ["packed", "shipped", "returned"]:
        move(staff, number, step)
    tea.refresh_from_db()
    assert tea.stock == 8


def test_staff_list_filters_and_search(setup):
    customer, staff, address, tea = setup
    cod = place(customer, address, tea, "cod", 1)["number"]
    upi = place(customer, address, tea, "upi", 1)["number"]

    def numbers(query):
        return [o["number"] for o in staff.get(f"/api/v1/staff/orders/?{query}").json()["results"]]

    assert numbers("") == [upi, cod]
    assert numbers("status=payment_pending") == [upi]
    assert numbers("payment_method=cod") == [cod]
    assert numbers("search=9876543210") == [upi, cod]
    assert staff.get(f"/api/v1/staff/orders/{cod}/").json()["customer_email"] == "ravi@x.com"


def test_customers_cannot_use_staff_order_endpoints(setup):
    customer, staff, address, tea = setup
    number = place(customer, address, tea)["number"]
    assert customer.get("/api/v1/staff/orders/").status_code == 403
    assert move(customer, number, "packed").status_code == 403
