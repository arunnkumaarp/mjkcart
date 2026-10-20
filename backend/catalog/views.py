from rest_framework import serializers, viewsets

from accounts.permissions import IsStaffRole

from .models import Product


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "name", "slug", "description", "price", "mrp", "stock", "image", "is_active",
                  "created_at", "updated_at"]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def validate(self, attrs):
        price = attrs.get("price", getattr(self.instance, "price", None))
        mrp = attrs.get("mrp", getattr(self.instance, "mrp", None))
        if price is not None and price <= 0:
            raise serializers.ValidationError({"price": "Price must be more than zero."})
        if mrp is not None and price is not None and mrp < price:
            raise serializers.ValidationError({"mrp": "MRP can't be less than the price."})
        return attrs


class ProductViewSet(viewsets.ModelViewSet):
    """Anyone can browse active products; staff and admins add, edit and remove them."""

    serializer_class = ProductSerializer
    lookup_field = "slug"
    search_fields = ["name", "description"]
    filterset_fields = ["is_active"]

    def get_queryset(self):
        products = Product.objects.all()
        if not (self.request.user.is_authenticated and self.request.user.is_shop_staff):
            products = products.filter(is_active=True)
        return products

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return []
        return [IsStaffRole()]

    def perform_destroy(self, instance):
        # Hide rather than delete; staff can bring it back with is_active=true.
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
