import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction

from core.models import ShopSettings

from .models import Order

log = logging.getLogger(__name__)
S = Order.Status

# Statuses the customer hears about. Packing is internal, so it sends nothing.
CUSTOMER_STATUSES = {S.CONFIRMED, S.SHIPPED, S.DELIVERED, S.CANCELLED, S.RETURNED}


def notify(order, kind, note=""):
    """Email about this order once the current transaction commits. kind: placed, payment_rejected,
    payment_submitted or a status in CUSTOMER_STATUSES."""
    transaction.on_commit(lambda: _send(order.pk, kind, note))


def _send(order_pk, kind, note):
    order = Order.objects.select_related("user", "courier").prefetch_related("items").get(pk=order_pk)
    shop = ShopSettings.load()
    try:
        if kind == "payment_submitted":
            _to_shop(shop, f"Check UPI payment for {order.number}",
                     f"{order.user.email} sent proof of payment for {order.number} (₹{order.total}).\n"
                     "Check it in the payments queue.")
            return
        subject, intro = _customer_message(order, kind, note, shop)
        _mail(f"{subject} · {shop.shop_name}", f"{intro}\n\n{_summary(order)}{_footer(order, shop)}",
              [order.user.email])
        if kind == "placed":
            _to_shop(shop, f"New order {order.number} · ₹{order.total}",
                     f"{order.get_payment_method_display()} order from {order.user.email}.\n\n{_summary(order)}")
    except Exception:  # A failed email must never undo or block the order.
        log.exception("Could not send %s email for order %s", kind, order.number)


def _customer_message(order, kind, note, shop):
    n, total = order.number, f"₹{order.total}"
    if kind == "placed" and order.status == S.PAYMENT_PENDING:
        pay_to = f"UPI ID: {shop.upi_id}\n" if shop.upi_id else ""
        return (f"Pay {total} to confirm order {n}",
                f"Thanks for your order! Please pay {total} by UPI to confirm it.\n{pay_to}"
                "After paying, send the UPI reference number or a screenshot from the order page.")
    if kind == "placed":
        return f"Order {n} confirmed", f"Thanks for your order! Please keep {total} ready for cash on delivery."
    if kind == "payment_rejected":
        return (f"We couldn't confirm your payment for {n}",
                f"We couldn't find your UPI payment for order {n}." + (f"\nReason: {note}" if note else "") +
                "\nPlease check and send the proof again from the order page.")
    return {
        S.CONFIRMED: (f"Payment received, order {n} confirmed", "We've received your payment. We'll pack your order soon."),
        S.SHIPPED: (f"Order {n} is on its way", "Your order has been shipped." + _tracking(order)),
        S.DELIVERED: (f"Order {n} delivered", "Your order has been delivered. Thank you for shopping with us!"),
        S.CANCELLED: (f"Order {n} cancelled", "Your order has been cancelled." +
                      (" If you already paid, we'll refund you." if order.payment_method == Order.Payment.UPI else "")),
        S.RETURNED: (f"Return received for {n}", "We've received your returned order."),
    }[kind]


def _tracking(order):
    if not order.courier:
        return ""
    text = f"\nCourier: {order.courier.name}\nTracking number: {order.tracking_number}"
    return text + (f"\nTrack it: {order.tracking_url}" if order.tracking_url else "")


def _summary(order):
    lines = [f"Order {order.number}"]
    lines += [f"  {i.quantity} × {i.product_name}{f' ({i.label})' if i.label else ''}  ₹{i.line_total}"
              for i in order.items.all()]
    lines.append(f"Items ₹{order.subtotal}" +
                 (f" · Coupon {order.coupon_code} −₹{order.discount}" if order.discount else "") +
                 f" · Delivery ₹{order.shipping_fee}" +
                 (f" · COD fee ₹{order.cod_fee}" if order.cod_fee else "") + f" · Total ₹{order.total}")
    lines.append(f"Deliver to: {order.ship_name}, {order.ship_line1}, {order.ship_city} {order.ship_pincode}")
    return "\n".join(lines)


def _footer(order, shop):
    parts = []
    if settings.FRONTEND_URL:
        parts.append(f"View your order: {settings.FRONTEND_URL.rstrip('/')}/orders/{order.number}")
    contact = " · ".join(c for c in (shop.support_phone, shop.support_email) if c)
    if contact:
        parts.append(f"Questions? {contact}")
    return "\n\n" + "\n".join(parts) if parts else ""


def _to_shop(shop, subject, body):
    if shop.support_email:
        _mail(subject, body, [shop.support_email])


def _mail(subject, body, to):
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, to)
