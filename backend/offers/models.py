from decimal import ROUND_HALF_UP, Decimal

from django.db import models
from django.utils import timezone

from orders.models import Order


class Coupon(models.Model):
    """A discount code customers type at checkout."""

    class Kind(models.TextChoices):
        PERCENT = "percent", "Percent off"
        FLAT = "flat", "Rupees off"

    code = models.CharField(max_length=30, unique=True)
    description = models.CharField(max_length=120, blank=True, default="")
    kind = models.CharField(max_length=7, choices=Kind.choices)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    # For percent coupons: the most it can take off, e.g. 10% up to ₹200.
    max_discount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    min_order = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    # Empty means no limit. Cancelled orders give their use back.
    usage_limit = models.PositiveIntegerField(null=True, blank=True)
    per_customer_limit = models.PositiveIntegerField(null=True, blank=True, default=1)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.code

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        super().save(*args, **kwargs)

    def uses(self, user=None):
        orders = self.orders.exclude(status=Order.Status.CANCELLED)
        return (orders.filter(user=user) if user else orders).count()

    def problem(self, user, subtotal, now=None):
        """Why this coupon can't be used on this cart, or None."""
        now = now or timezone.now()
        if not self.is_active or (self.ends_at and now > self.ends_at):
            return f"Coupon {self.code} has expired."
        if self.starts_at and now < self.starts_at:
            return f"Coupon {self.code} isn't active yet."
        if subtotal < self.min_order:
            return f"Add items worth ₹{self.min_order - subtotal:.0f} more to use {self.code}."
        if self.usage_limit is not None and self.uses() >= self.usage_limit:
            return f"Coupon {self.code} has been fully used."
        if self.per_customer_limit is not None and self.uses(user) >= self.per_customer_limit:
            return f"You've already used {self.code}."
        return None

    def discount_on(self, subtotal):
        if self.kind == self.Kind.PERCENT:
            off = (subtotal * self.value / 100).quantize(Decimal("0.01"), ROUND_HALF_UP)
            if self.max_discount is not None:
                off = min(off, self.max_discount)
        else:
            off = self.value
        return min(off, subtotal)
