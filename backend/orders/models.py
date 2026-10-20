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
    shipping_fee = models.DecimalField(max_digits=8, decimal_places=2)
    cod_fee = models.DecimalField(max_digits=8, decimal_places=2)
    total = models.DecimalField(max_digits=12, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.number


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
