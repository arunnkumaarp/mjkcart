import secrets
from datetime import timedelta

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac


class User(AbstractUser):
    class Role(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        STAFF = "staff", "Staff"
        ADMIN = "admin", "Admin"

    phone = models.CharField(max_length=15, blank=True, default="")
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.CUSTOMER)

    @property
    def is_shop_admin(self):
        """Full access: money, reports, offers, settings and team."""
        return self.role == self.Role.ADMIN or self.is_superuser

    @property
    def is_shop_staff(self):
        """Day-to-day access: orders, dispatch, products, stock and customers."""
        return self.role == self.Role.STAFF or self.is_shop_admin


class EmailOTP(models.Model):
    """One-time login code sent by email. Only a hash of the code is stored."""

    TTL = timedelta(minutes=10)
    RESEND_AFTER = timedelta(seconds=60)
    MAX_ATTEMPTS = 5

    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    @staticmethod
    def _hash(email, code):
        return salted_hmac("email-otp", f"{email}:{code}").hexdigest()

    @classmethod
    def issue(cls, email):
        code = f"{secrets.randbelow(10**6):06d}"
        cls.objects.filter(email=email, used=False).update(used=True)
        cls.objects.create(email=email, code_hash=cls._hash(email, code))
        return code

    @classmethod
    def latest_for(cls, email):
        return cls.objects.filter(email=email).first()

    @property
    def expired(self):
        return timezone.now() - self.created_at > self.TTL

    def check_code(self, code):
        """Counts the attempt; returns True once for the right code within limits."""
        if self.used or self.expired or self.attempts >= self.MAX_ATTEMPTS:
            return False
        self.attempts += 1
        ok = constant_time_compare(self.code_hash, self._hash(self.email, code))
        if ok:
            self.used = True
        self.save(update_fields=["attempts", "used"])
        return ok


class Address(models.Model):
    """A delivery address in India; couriers need the phone and the 6-digit pincode."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="addresses")
    name = models.CharField(max_length=80)
    phone = models.CharField(max_length=15)
    line1 = models.CharField(max_length=200)
    line2 = models.CharField(max_length=200, blank=True, default="")
    landmark = models.CharField(max_length=120, blank=True, default="")
    city = models.CharField(max_length=80)
    state = models.CharField(max_length=80)
    pincode = models.CharField(max_length=6)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_default", "-created_at"]

    def __str__(self):
        return f"{self.name}, {self.city} {self.pincode}"

    def save(self, *args, **kwargs):
        # The first address is the default; making one default clears the others.
        if not self.pk and not self.user.addresses.exists():
            self.is_default = True
        super().save(*args, **kwargs)
        if self.is_default:
            self.user.addresses.exclude(pk=self.pk).update(is_default=False)
