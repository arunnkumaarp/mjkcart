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
