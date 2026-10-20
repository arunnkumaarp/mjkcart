from django.db import transaction
from django.db.models import F

from catalog.models import Variant

from .emails import CUSTOMER_STATUSES, notify
from .models import Order

S = Order.Status

# Where an order may go next. Cancelled and returned are final.
NEXT = {
    S.PAYMENT_PENDING: [S.CONFIRMED, S.CANCELLED],
    S.CONFIRMED: [S.PACKED, S.CANCELLED],
    S.PACKED: [S.SHIPPED, S.CANCELLED],
    S.SHIPPED: [S.DELIVERED, S.RETURNED],
    S.DELIVERED: [S.RETURNED],
    S.CANCELLED: [],
    S.RETURNED: [],
}

# Customers may cancel only before the shop starts packing.
CUSTOMER_CANCELLABLE = {S.PAYMENT_PENDING, S.CONFIRMED}


class StatusError(Exception):
    pass


@transaction.atomic
def change_status(order, status, by, note="", courier=None, tracking_number=""):
    """Move the order on, record it in the history, and put stock back when it is cancelled.
    Shipping needs a courier and tracking number, given here or already saved on the order."""
    order = Order.objects.select_for_update().get(pk=order.pk)
    if status not in NEXT[order.status]:
        raise StatusError(f"A {order.get_status_display().lower()} order can't be marked {S(status).label.lower()}.")
    if status == S.SHIPPED:
        order.courier = courier or order.courier
        order.tracking_number = tracking_number.strip() or order.tracking_number
        if not (order.courier and order.tracking_number):
            raise StatusError("Add the courier and tracking number to mark the order shipped.")
    if status == S.CANCELLED:
        # Returned parcels are checked by hand before going back on the shelf, so only cancels restock.
        for item in order.items.exclude(variant=None):
            Variant.objects.filter(pk=item.variant_id).update(stock=F("stock") + item.quantity)
    order.status = status
    order.save(update_fields=["status", "courier", "tracking_number", "updated_at"])
    order.events.create(status=status, note=note, by=by)
    if status in CUSTOMER_STATUSES:
        notify(order, status, note)
    return order
