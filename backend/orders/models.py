from django.conf import settings
from django.db import models

from catalog.models import Variant


class Cart(models.Model):
    """Each customer's one saved cart. Prices are read live from variants; orders copy them."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cart")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Cart of {self.user}"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey(Variant, on_delete=models.CASCADE, related_name="+")
    quantity = models.PositiveIntegerField()
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["added_at", "id"]
        constraints = [models.UniqueConstraint(fields=["cart", "variant"], name="one_row_per_variant")]

    def __str__(self):
        return f"{self.quantity} × {self.variant}"

    @property
    def available(self):
        """Still for sale with enough stock; checkout refuses carts with unavailable items."""
        v = self.variant
        return v.is_active and v.product.is_active and v.stock >= self.quantity

    @property
    def line_total(self):
        return self.variant.price * self.quantity


class Courier(models.Model):
    """A delivery company the shop ships with. The tracking link has {number} where the tracking number goes."""

    name = models.CharField(max_length=60, unique=True)
    tracking_url = models.CharField(max_length=300, blank=True, default="",
                                    help_text="e.g. https://example.com/track?id={number}")
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name

    def tracking_link(self, number):
        if not self.tracking_url:
            return ""
        return self.tracking_url.replace("{number}", number)


class Order(models.Model):
    """A placed order. Address, prices and product names are copied so later edits don't change it."""

    class Status(models.TextChoices):
        PAYMENT_PENDING = "payment_pending", "Waiting for UPI payment"
        CONFIRMED = "confirmed", "Confirmed"
        PACKED = "packed", "Packed"
        SHIPPED = "shipped", "Shipped"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"
        RETURNED = "returned", "Returned"

    class Payment(models.TextChoices):
        COD = "cod", "Cash on delivery"
        UPI = "upi", "UPI"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders")
    number = models.CharField(max_length=12, unique=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices)
    payment_method = models.CharField(max_length=3, choices=Payment.choices)

    ship_name = models.CharField(max_length=80)
    ship_phone = models.CharField(max_length=15)
    ship_line1 = models.CharField(max_length=200)
    ship_line2 = models.CharField(max_length=200, blank=True, default="")
    ship_landmark = models.CharField(max_length=120, blank=True, default="")
    ship_city = models.CharField(max_length=80)
    ship_state = models.CharField(max_length=80)
    ship_pincode = models.CharField(max_length=6)

    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    coupon = models.ForeignKey("offers.Coupon", null=True, blank=True, on_delete=models.SET_NULL, related_name="orders")
    coupon_code = models.CharField(max_length=30, blank=True, default="")
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    shipping_fee = models.DecimalField(max_digits=8, decimal_places=2)
    cod_fee = models.DecimalField(max_digits=8, decimal_places=2)
    total = models.DecimalField(max_digits=12, decimal_places=2)

    courier = models.ForeignKey(Courier, null=True, blank=True, on_delete=models.PROTECT, related_name="orders")
    tracking_number = models.CharField(max_length=40, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.number

    @property
    def tracking_url(self):
        return self.courier.tracking_link(self.tracking_number) if self.courier and self.tracking_number else ""

    @property
    def weight_grams(self):
        return sum(i.weight_grams * i.quantity for i in self.items.all())

    @property
    def cash_to_collect(self):
        return self.total if self.payment_method == self.Payment.COD else 0


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey(Variant, null=True, on_delete=models.SET_NULL, related_name="+")
    product_name = models.CharField(max_length=120)
    label = models.CharField(max_length=90, blank=True, default="")
    sku = models.CharField(max_length=40, blank=True, default="")
    price = models.DecimalField(max_digits=10, decimal_places=2)
    mrp = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    quantity = models.PositiveIntegerField()
    weight_grams = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.quantity} × {self.product_name}"

    @property
    def line_total(self):
        return self.price * self.quantity


class OrderEvent(models.Model):
    """One step in an order's history; the customer sees these as the tracking timeline."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="events")
    status = models.CharField(max_length=20, choices=Order.Status.choices)
    note = models.CharField(max_length=200, blank=True, default="")
    by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["at", "id"]

    def __str__(self):
        return f"{self.order} → {self.status}"


class PaymentProof(models.Model):
    """A customer's proof of a UPI payment, checked by hand against the shop's bank app."""

    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Waiting for check"
        VERIFIED = "verified", "Verified"
        REJECTED = "rejected", "Rejected"

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="payment_proofs")
    # The UPI transaction reference (UTR) shown in the customer's payment app.
    reference = models.CharField(max_length=30, blank=True, default="", db_index=True)
    screenshot = models.ImageField(upload_to="payments/", blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUBMITTED)
    reject_reason = models.CharField(max_length=200, blank=True, default="")
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-submitted_at", "-id"]

    def __str__(self):
        return f"{self.order} payment {self.reference or self.pk}"
