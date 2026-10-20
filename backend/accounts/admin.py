from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Address, User


@admin.register(User)
class ShopUserAdmin(UserAdmin):
    list_display = ["email", "first_name", "phone", "role", "is_active", "date_joined"]
    list_filter = ["role", "is_active"]
    search_fields = ["email", "first_name", "phone"]
    fieldsets = UserAdmin.fieldsets + (("Shop", {"fields": ["phone", "role"]}),)


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ["name", "user", "city", "state", "pincode", "is_default"]
    search_fields = ["name", "phone", "pincode", "user__email"]
