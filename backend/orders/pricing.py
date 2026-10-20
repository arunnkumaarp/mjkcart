from decimal import Decimal

from core.models import ShopSettings

from .models import Order

ZERO = Decimal("0.00")


def quote(cart, payment_method, shop=None):
    """Totals for checking out this cart, plus the reasons it can't be placed yet (empty list if it can)."""
    shop = shop or ShopSettings.load()
    items = list(cart.items.select_related("variant__product"))
    problems = []
    if not items:
        problems.append("Your cart is empty.")
    for item in items:
        if not item.available:
            problems.append(f"{item.variant} is out of stock or no longer available.")

    subtotal = sum((i.line_total for i in items if i.available), ZERO)
    shipping = ZERO if not items or subtotal >= shop.free_shipping_above else shop.shipping_flat
    cod_fee = ZERO
    if payment_method == Order.Payment.COD:
        if not shop.cod_enabled:
            problems.append("Cash on delivery isn't available right now.")
        elif subtotal + shipping > shop.cod_max_order:
            problems.append(f"Cash on delivery is available for orders up to ₹{shop.cod_max_order:.0f}.")
        cod_fee = shop.cod_fee
    elif payment_method == Order.Payment.UPI and not shop.upi_id and not shop.upi_qr:
        problems.append("UPI payment isn't set up yet.")

    return {
        "items": items,
        "subtotal": subtotal,
        "shipping_fee": shipping,
        "cod_fee": cod_fee,
        "total": subtotal + shipping + cod_fee,
        "problems": problems,
    }
