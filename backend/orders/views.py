from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from catalog.models import Variant

from .models import Cart, CartItem


def stock_error(variant, quantity):
    """Why this quantity can't be bought, or None if it can."""
    if not (variant.is_active and variant.product.is_active):
        return "This item is no longer available."
    if variant.stock == 0:
        return "Out of stock."
    if quantity > variant.stock:
        return f"Only {variant.stock} left."
    return None


class CartItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    product_slug = serializers.CharField(source="variant.product.slug", read_only=True)
    label = serializers.CharField(source="variant.label", read_only=True)
    price = serializers.DecimalField(source="variant.price", max_digits=10, decimal_places=2, read_only=True)
    mrp = serializers.DecimalField(source="variant.mrp", max_digits=10, decimal_places=2, read_only=True,
                                   allow_null=True)
    image = serializers.SerializerMethodField()
    stock = serializers.IntegerField(source="variant.stock", read_only=True)
    available = serializers.BooleanField(read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = CartItem
        fields = ["id", "variant", "quantity", "product_name", "product_slug", "label", "price", "mrp", "image",
                  "stock", "available", "line_total"]

    def get_image(self, item) -> str | None:
        first = next(iter(item.variant.product.images.all()), None)
        if not first:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(first.image.url) if request else first.image.url


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ["items", "item_count", "subtotal", "updated_at"]

    def get_item_count(self, cart) -> int:
        return sum(i.quantity for i in cart.items.all())

    def get_subtotal(self, cart) -> str:
        # Only items that can actually be bought count towards the total.
        return f"{sum((i.line_total for i in cart.items.all() if i.available), 0):.2f}"


class AddItemSerializer(serializers.Serializer):
    variant = serializers.PrimaryKeyRelatedField(queryset=Variant.objects.select_related("product"))
    quantity = serializers.IntegerField(min_value=1, default=1)


class QuantitySerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)


class MergeSerializer(serializers.Serializer):
    items = AddItemSerializer(many=True)


def cart_for(user):
    return Cart.objects.get_or_create(user=user)[0]


def cart_response(request, cart, code=status.HTTP_200_OK):
    cart = Cart.objects.prefetch_related(
        "items__variant__product__images").get(pk=cart.pk)
    return Response(CartSerializer(cart, context={"request": request}).data, status=code)


@extend_schema(methods=["GET"], responses=CartSerializer)
@extend_schema(methods=["DELETE"], responses=CartSerializer, description="Empty the cart.")
@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
def cart(request):
    cart = cart_for(request.user)
    if request.method == "DELETE":
        cart.items.all().delete()
    return cart_response(request, cart)


@extend_schema(request=AddItemSerializer, responses=CartSerializer,
               description="Add a variant; adding one already in the cart increases its quantity.")
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def add_item(request):
    s = AddItemSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    variant, quantity = s.validated_data["variant"], s.validated_data["quantity"]
    cart = cart_for(request.user)
    item = cart.items.filter(variant=variant).first()
    total = quantity + (item.quantity if item else 0)
    if error := stock_error(variant, total):
        return Response({"quantity": [error]}, status=status.HTTP_400_BAD_REQUEST)
    if item:
        item.quantity = total
        item.save(update_fields=["quantity"])
    else:
        cart.items.create(variant=variant, quantity=quantity)
    cart.save(update_fields=["updated_at"])
    return cart_response(request, cart, status.HTTP_201_CREATED)


@extend_schema(methods=["PATCH"], request=QuantitySerializer, responses=CartSerializer)
@extend_schema(methods=["DELETE"], request=None, responses=CartSerializer)
@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def item(request, pk):
    cart = cart_for(request.user)
    item = get_object_or_404(cart.items.select_related("variant__product"), pk=pk)
    if request.method == "DELETE":
        item.delete()
    else:
        s = QuantitySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        quantity = s.validated_data["quantity"]
        if error := stock_error(item.variant, quantity):
            return Response({"quantity": [error]}, status=status.HTTP_400_BAD_REQUEST)
        item.quantity = quantity
        item.save(update_fields=["quantity"])
    cart.save(update_fields=["updated_at"])
    return cart_response(request, cart)


@extend_schema(request=MergeSerializer, responses=CartSerializer,
               description="After login, send the cart kept on the device. Quantities are added and capped at "
                           "stock; items that can't be bought are skipped.")
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def merge(request):
    s = MergeSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    cart = cart_for(request.user)
    for line in s.validated_data["items"]:
        variant = line["variant"]
        if stock_error(variant, 1):
            continue
        item, _ = cart.items.get_or_create(variant=variant, defaults={"quantity": 0})
        item.quantity = min(item.quantity + line["quantity"], variant.stock)
        item.save(update_fields=["quantity"])
    cart.save(update_fields=["updated_at"])
    return cart_response(request, cart)
