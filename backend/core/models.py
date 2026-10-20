from decimal import Decimal

from django.db import models


class ShopSettings(models.Model):
    """The one row of shop-wide settings the admin edits: name, payments and shipping."""

    shop_name = models.CharField(max_length=80, default="MJK Cart")
    # Brand, shown on the storefront. Admins upload their own logo; without one the name is set as a wordmark.
    logo = models.ImageField(upload_to="shop/", blank=True)
    tagline = models.CharField(max_length=120, blank=True, default="Good things, packed with care.")
    # Paragraphs separated by a blank line. Sample text; the shop replaces it with its own.
    story = models.TextField(blank=True, default=(
        "MJK started with three initials on a kitchen table and a box of things we loved too much to keep "
        "to ourselves.\n\n"
        "We had spent years buying things that looked good in a photograph and gave up in a month. So we "
        "began asking one question of everything we use: would we give this to someone we love?\n\n"
        "Every product in this shop has passed that question. We pack each order ourselves, tick every item "
        "off by hand and write your pincode large enough for any courier to read.\n\n"
        "It is a slower way to run a shop. But somewhere in India a parcel is arriving at a door because of "
        "it, and that is the whole point."))
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
