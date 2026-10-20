from django.contrib import admin

from .models import Category, Product, ProductImage, Variant


class VariantInline(admin.TabularInline):
    model = Variant
    extra = 1
    fields = ["size", "colour", "sku", "price", "mrp", "stock", "weight_grams", "sort_order", "is_active"]


class ImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "is_active", "created_at"]
    list_filter = ["is_active", "category"]
    search_fields = ["name", "slug", "variants__sku"]
    inlines = [VariantInline, ImageInline]


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "parent", "sort_order", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name"]
