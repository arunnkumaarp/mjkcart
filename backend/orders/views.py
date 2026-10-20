from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, extend_schema_field
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.views import DetailSerializer
from catalog.models import Variant

from .models import Cart, CartItem, Order, OrderEvent, OrderItem
from .pricing import quote
from .status import CUSTOMER_CANCELLABLE, StatusError, change_status


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


@extend_schema_field(OpenApiTypes.INT)
class OwnAddressField(serializers.PrimaryKeyRelatedField):
    """Only the customer's own addresses can be chosen."""

    def get_queryset(self):
        return self.context["request"].user.addresses.all()


class CheckoutSerializer(serializers.Serializer):
    address = OwnAddressField()
    payment_method = serializers.ChoiceField(choices=Order.Payment.choices)


class QuoteSerializer(serializers.Serializer):
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2)
    shipping_fee = serializers.DecimalField(max_digits=8, decimal_places=2)
    cod_fee = serializers.DecimalField(max_digits=8, decimal_places=2)
    total = serializers.DecimalField(max_digits=12, decimal_places=2)
    problems = serializers.ListField(child=serializers.CharField())


class OrderItemSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = ["id", "variant", "product_name", "label", "sku", "price", "mrp", "quantity", "line_total"]


class OrderEventSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = OrderEvent
        fields = ["status", "status_label", "note", "at"]


class LatestPaymentSerializer(serializers.Serializer):
    status = serializers.CharField()
    status_label = serializers.CharField(source="get_status_display")
    reference = serializers.CharField()
    reject_reason = serializers.CharField()
    submitted_at = serializers.DateTimeField()


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    # The newest UPI proof, so the app can show "checking" or "rejected, try again".
    payment = serializers.SerializerMethodField()
    events = OrderEventSerializer(many=True, read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ["number", "status", "status_label", "can_cancel", "payment_method", "payment", "items", "events",
                  "ship_name", "ship_phone", "ship_line1", "ship_line2", "ship_landmark", "ship_city",
                  "ship_state", "ship_pincode", "subtotal", "shipping_fee", "cod_fee", "total", "created_at"]

    @extend_schema_field(LatestPaymentSerializer(allow_null=True))
    def get_payment(self, order):
        proof = next(iter(order.payment_proofs.all()), None)
        return LatestPaymentSerializer(proof).data if proof else None

    def get_can_cancel(self, order) -> bool:
        return order.status in CUSTOMER_CANCELLABLE


def checkout_input(request):
    s = CheckoutSerializer(data=request.data, context={"request": request})
    s.is_valid(raise_exception=True)
    return s.validated_data["address"], s.validated_data["payment_method"]


@extend_schema(request=CheckoutSerializer, responses=QuoteSerializer,
               description="Totals for the checkout screen. Problems lists anything that stops the order.")
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def checkout_quote(request):
    _, payment_method = checkout_input(request)
    q = quote(cart_for(request.user), payment_method)
    return Response(QuoteSerializer(q).data)


class OrderRefusedSerializer(serializers.Serializer):
    detail = serializers.CharField()
    problems = serializers.ListField(child=serializers.CharField())


@extend_schema(methods=["GET"], responses=OrderSerializer(many=True))
@extend_schema(methods=["POST"], request=CheckoutSerializer, responses={201: OrderSerializer, 400: OrderRefusedSerializer},
               description="Place the cart as an order: stock is taken and the cart emptied. "
                           "COD orders are confirmed at once; UPI orders wait for the payment check.")
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def orders(request):
    if request.method == "GET":
        return Response(OrderSerializer(my_orders(request), many=True).data)

    address, payment_method = checkout_input(request)
    with transaction.atomic():
        cart = cart_for(request.user)
        # Lock the variants so two customers can't buy the last one together.
        list(Variant.objects.select_for_update().filter(pk__in=cart.items.values("variant")))
        q = quote(cart, payment_method)
        if q["problems"]:
            return Response({"detail": "The order can't be placed yet.", "problems": q["problems"]},
                            status=status.HTTP_400_BAD_REQUEST)

        order = Order.objects.create(
            user=request.user, payment_method=payment_method,
            status=Order.Status.CONFIRMED if payment_method == Order.Payment.COD else Order.Status.PAYMENT_PENDING,
            ship_name=address.name, ship_phone=address.phone, ship_line1=address.line1, ship_line2=address.line2,
            ship_landmark=address.landmark, ship_city=address.city, ship_state=address.state,
            ship_pincode=address.pincode,
            subtotal=q["subtotal"], shipping_fee=q["shipping_fee"], cod_fee=q["cod_fee"], total=q["total"],
        )
        order.number = f"MJK{order.pk:06d}"
        order.save(update_fields=["number"])
        OrderItem.objects.bulk_create(OrderItem(
            order=order, variant=i.variant, product_name=i.variant.product.name, label=i.variant.label,
            sku=i.variant.sku or "", price=i.variant.price, mrp=i.variant.mrp, quantity=i.quantity,
            weight_grams=i.variant.weight_grams,
        ) for i in q["items"])
        for i in q["items"]:
            Variant.objects.filter(pk=i.variant_id).update(stock=F("stock") - i.quantity)
        order.events.create(status=order.status, by=request.user)
        cart.items.all().delete()
    return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


@extend_schema(responses=OrderSerializer)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def order_detail(request, number):
    return Response(OrderSerializer(get_object_or_404(my_orders(request), number=number)).data)


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


@extend_schema(request=CancelSerializer, responses={200: OrderSerializer, 400: DetailSerializer},
               description="Customers can cancel until the shop starts packing; the stock goes back.")
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_order(request, number):
    order = get_object_or_404(request.user.orders, number=number)
    s = CancelSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    if order.status not in CUSTOMER_CANCELLABLE:
        return Response({"detail": "This order is already being packed. Please contact the shop."},
                        status=status.HTTP_400_BAD_REQUEST)
    try:
        change_status(order, Order.Status.CANCELLED, request.user, s.validated_data["reason"])
    except StatusError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(OrderSerializer(my_orders(request).get(pk=order.pk)).data)


def my_orders(request):
    return request.user.orders.prefetch_related("items", "events", "payment_proofs")
