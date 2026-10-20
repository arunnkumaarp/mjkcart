from django.contrib import admin

from .models import Cart, CartItem, Order, OrderItem


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    raw_id_fields = ["variant"]


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ["user", "updated_at"]
    search_fields = ["user__email"]
    inlines = [CartItemInline]


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    raw_id_fields = ["variant"]


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["number", "user", "status", "payment_method", "total", "ship_city", "created_at"]
    list_filter = ["status", "payment_method"]
    search_fields = ["number", "user__email", "ship_name", "ship_phone", "ship_pincode"]
    raw_id_fields = ["user"]
    inlines = [OrderItemInline]
