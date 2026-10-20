from decimal import Decimal

from django.db import models


class ShopSettings(models.Model):
    """The one row of shop-wide settings the admin edits: name, payments and shipping."""

    shop_name = models.CharField(max_length=80, default="MJK Cart")
    # Brand, shown on the storefront. Admins upload their own logo; without one the name is set as a wordmark.
    logo = models.ImageField(upload_to="shop/", blank=True)
    tagline = models.CharField(max_length=120, blank=True, default="Good things, packed with care.")
    story = models.TextField(blank=True, default=(
        "MJK began at a kitchen table with one idea: the things you use every day should be made well, "
        "priced fairly and arrive like a gift from someone who cares. We choose every product ourselves, "
        "pack every order by hand and answer every message. We would rather sell fewer things we believe "
        "in than a thousand we don't."))
    support_phone = models.CharField(max_length=15, blank=True, default="")
    support_email = models.EmailField(blank=True, default="")

    # Payments: cash on delivery and UPI QR only; the shop verifies QR payments by hand.
    upi_id = models.CharField(max_length=60, blank=True, default="")
    upi_qr = models.ImageField(upload_to="shop/", blank=True)
    cod_enabled = models.BooleanField(default=True)
    cod_fee = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("0"))
    cod_max_order = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("10000"))

    # Shipping across India by DHL / The Professional Couriers.
    shipping_flat = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("99"))
    free_shipping_above = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("999"))

    class Meta:
        verbose_name_plural = "shop settings"

    def __str__(self):
        return self.shop_name

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        return cls.objects.get_or_create(pk=1)[0]
