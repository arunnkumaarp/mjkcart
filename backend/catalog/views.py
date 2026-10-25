import django_filters
from django.db.models import Exists, Min, OuterRef, Prefetch, Q
from rest_framework import filters, serializers, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from accounts.permissions import IsStaffRole

from .models import Category, Product, ProductImage, Variant


def is_staff(request):
    return request.user.is_authenticated and request.user.is_shop_staff


class StaffWritesMixin:
    """Anyone can read; staff and admins write. Removing hides the row so past orders keep it."""

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return []
        return [IsStaffRole()]

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "parent", "sort_order", "is_active"]
        read_only_fields = ["slug"]

    def validate_parent(self, parent):
        if parent and self.instance and parent.pk in self.instance.descendant_ids():
            raise serializers.ValidationError("A category can't sit inside itself.")
        return parent


class VariantSerializer(serializers.ModelSerializer):
    label = serializers.CharField(read_only=True)

    class Meta:
        model = Variant
        fields = ["id", "product", "label", "size", "colour", "sku", "price", "mrp", "stock", "weight_grams",
                  "sort_order", "is_active"]

    def validate_sku(self, sku):
        return sku.strip() or None if sku else None

    def validate(self, attrs):
        price = attrs.get("price", getattr(self.instance, "price", None))
        mrp = attrs.get("mrp", getattr(self.instance, "mrp", None))
        if price is not None and price <= 0:
            raise serializers.ValidationError({"price": "Price must be more than zero."})
        if mrp is not None and price is not None and mrp < price:
            raise serializers.ValidationError({"mrp": "MRP can't be less than the price."})
        return attrs


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "product", "image", "alt", "sort_order"]


class ProductSerializer(serializers.ModelSerializer):
    variants = VariantSerializer(many=True, read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    # Lowest active variant price, for "from ₹180" on product cards.
    price_from = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, allow_null=True,
                                          default=None)
    in_stock = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = Product
        fields = ["id", "name", "slug", "description", "category", "is_active", "price_from", "in_stock",
                  "variants", "images", "created_at", "updated_at"]
        read_only_fields = ["slug", "created_at", "updated_at"]


class ProductFilter(django_filters.FilterSet):
    category = django_filters.CharFilter(method="in_category", help_text="Category slug; includes sub-categories.")
    min_price = django_filters.NumberFilter(field_name="price_from", lookup_expr="gte")
    max_price = django_filters.NumberFilter(field_name="price_from", lookup_expr="lte")
    in_stock = django_filters.BooleanFilter()

    class Meta:
        model = Product
        fields = ["is_active"]

    def in_category(self, queryset, name, slug):
        category = Category.objects.filter(slug=slug).first()
        return queryset.filter(category_id__in=category.descendant_ids()) if category else queryset.none()


class ProductViewSet(StaffWritesMixin, viewsets.ModelViewSet):
    """Customers see active products that have something to buy; staff see everything."""

    serializer_class = ProductSerializer
    lookup_field = "slug"
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = ProductFilter
    search_fields = ["name", "description", "variants__sku"]
    ordering_fields = ["price_from", "created_at", "name"]

    def get_queryset(self):
        staff = is_staff(self.request)
        variants = Variant.objects.all() if staff else Variant.objects.filter(is_active=True)
        live = Q(variants__is_active=True)
        products = Product.objects.annotate(
            price_from=Min("variants__price", filter=live),
            in_stock=Exists(Variant.objects.filter(product=OuterRef("pk"), is_active=True, stock__gt=0)),
        ).prefetch_related(Prefetch("variants", queryset=variants), "images")
        if not staff:
            # A hidden shelf hides everything on it, so a shop can switch what it sells by hiding shelves.
            products = products.filter(is_active=True, price_from__isnull=False).exclude(category__is_active=False)
        return products


class CategoryViewSet(StaffWritesMixin, viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    lookup_field = "slug"
    pagination_class = None

    def get_queryset(self):
        categories = Category.objects.all()
        return categories if is_staff(self.request) else categories.filter(is_active=True)


class VariantViewSet(StaffWritesMixin, viewsets.ModelViewSet):
    """Staff manage variants here; customers get them inside the product."""

    serializer_class = VariantSerializer
    queryset = Variant.objects.select_related("product")
    filterset_fields = ["product", "is_active"]

    def get_permissions(self):
        return [IsStaffRole()]


class ProductImageViewSet(viewsets.ModelViewSet):
    """Upload images as multipart form data. Deleting an image removes the file too."""

    serializer_class = ProductImageSerializer
    queryset = ProductImage.objects.all()
    permission_classes = [IsStaffRole]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ["product"]

    def perform_destroy(self, instance):
        instance.image.delete(save=False)
        instance.delete()
