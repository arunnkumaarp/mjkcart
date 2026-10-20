from django.contrib import admin

from .models import Coupon


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = ["code", "kind", "value", "min_order", "ends_at", "usage_limit", "is_active"]
    list_filter = ["kind", "is_active"]
    search_fields = ["code", "description"]
