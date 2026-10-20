from django.contrib import admin, messages
from django.http import HttpResponse

from .models import Cart, CartItem, Courier, Order, OrderEvent, OrderItem, PaymentProof
from .staff import render_slips
from .status import StatusError, change_status


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


class OrderEventInline(admin.TabularInline):
    model = OrderEvent
    extra = 0
    readonly_fields = ["status", "note", "by", "at"]
    can_delete = False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["number", "user", "status", "payment_method", "total", "ship_city", "created_at"]
    list_filter = ["status", "payment_method"]
    search_fields = ["number", "user__email", "ship_name", "ship_phone", "ship_pincode"]
    raw_id_fields = ["user"]
    inlines = [OrderItemInline, OrderEventInline]
    actions = ["print_slips"]

    @admin.action(description="Print packing slips and labels")
    def print_slips(self, request, queryset):
        return HttpResponse(render_slips(queryset.select_related("courier").prefetch_related("items")))

    def save_model(self, request, obj, form, change):
        # Status changes go through the same rules as the app: history, allowed steps, restocking.
        if change and "status" in form.changed_data:
            new_status, obj.status = obj.status, form.initial["status"]
            super().save_model(request, obj, form, change)
            try:
                change_status(obj, new_status, request.user, "Changed in Django admin")
            except StatusError as e:
                messages.error(request, str(e))
        else:
            super().save_model(request, obj, form, change)


@admin.register(PaymentProof)
class PaymentProofAdmin(admin.ModelAdmin):
    list_display = ["order", "reference", "status", "submitted_at", "reviewed_by"]
    list_filter = ["status"]
    search_fields = ["reference", "order__number"]
    raw_id_fields = ["order"]
    readonly_fields = ["reviewed_by", "reviewed_at"]


@admin.register(Courier)
class CourierAdmin(admin.ModelAdmin):
    list_display = ["name", "tracking_url", "sort_order", "is_active"]
    list_editable = ["sort_order", "is_active"]
