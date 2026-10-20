from datetime import timedelta

from django.db.models import Count, F, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsAdminRole, IsStaffRole
from catalog.models import Variant
from orders.models import Order, OrderItem, PaymentProof

S = Order.Status
# Orders that count as sales: paid or due on delivery, and not cancelled or returned.
SOLD = [S.CONFIRMED, S.PACKED, S.SHIPPED, S.DELIVERED]


class PeriodSerializer(serializers.Serializer):
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)

    def validate(self, attrs):
        to = attrs.get("date_to") or timezone.localdate()
        start = attrs.get("date_from") or to - timedelta(days=29)
        if start > to:
            raise serializers.ValidationError({"date_from": "Must be on or before date_to."})
        if (to - start).days > 366:
            raise serializers.ValidationError({"date_from": "Pick a period of a year or less."})
        return {"date_from": start, "date_to": to}


PERIOD = [OpenApiParameter("date_from", OpenApiTypes.DATE, description="Default: 29 days before date_to"),
          OpenApiParameter("date_to", OpenApiTypes.DATE, description="Default: today")]


def period(request):
    s = PeriodSerializer(data=request.query_params)
    s.is_valid(raise_exception=True)
    return s.validated_data["date_from"], s.validated_data["date_to"]


def sold_orders(start, end):
    return Order.objects.filter(status__in=SOLD, created_at__date__gte=start, created_at__date__lte=end)


def money(value):
    return f"{value or 0:.2f}"


class MethodTotalsSerializer(serializers.Serializer):
    orders = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2)


class SummarySerializer(serializers.Serializer):
    date_from = serializers.DateField()
    date_to = serializers.DateField()
    orders = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2, help_text="Order totals incl. delivery and fees")
    items_sold = serializers.IntegerField()
    average_order = serializers.DecimalField(max_digits=12, decimal_places=2)
    discounts = serializers.DecimalField(max_digits=12, decimal_places=2)
    cod = MethodTotalsSerializer()
    upi = MethodTotalsSerializer()
    cancelled = serializers.IntegerField()
    returned = serializers.IntegerField()
    # Right now, whatever the period: work waiting for the team.
    payments_to_check = serializers.IntegerField()
    to_pack = serializers.IntegerField()
    to_ship = serializers.IntegerField()


@extend_schema(parameters=PERIOD, responses=SummarySerializer)
@api_view(["GET"])
@permission_classes([IsAdminRole])
def summary(request):
    start, end = period(request)
    sold = sold_orders(start, end)
    totals = sold.aggregate(orders=Count("id"), revenue=Sum("total"), discounts=Sum("discount"))
    by_method = {row["payment_method"]: row for row in
                 sold.values("payment_method").annotate(orders=Count("id"), revenue=Sum("total"))}
    in_period = Order.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
    orders = totals["orders"]
    return Response({
        "date_from": start, "date_to": end,
        "orders": orders,
        "revenue": money(totals["revenue"]),
        "items_sold": OrderItem.objects.filter(order__in=sold).aggregate(n=Sum("quantity"))["n"] or 0,
        "average_order": money(totals["revenue"] / orders if orders else 0),
        "discounts": money(totals["discounts"]),
        **{m: {"orders": by_method.get(m, {}).get("orders", 0), "revenue": money(by_method.get(m, {}).get("revenue"))}
           for m in Order.Payment.values},
        "cancelled": in_period.filter(status=S.CANCELLED).count(),
        "returned": in_period.filter(status=S.RETURNED).count(),
        "payments_to_check": PaymentProof.objects.filter(status=PaymentProof.Status.SUBMITTED).count(),
        "to_pack": Order.objects.filter(status=S.CONFIRMED).count(),
        "to_ship": Order.objects.filter(status=S.PACKED).count(),
    })


class DaySerializer(serializers.Serializer):
    date = serializers.DateField()
    orders = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2)


@extend_schema(parameters=PERIOD, responses=DaySerializer(many=True))
@api_view(["GET"])
@permission_classes([IsAdminRole])
def daily(request):
    """One row per day in the period, including days with no sales, for a chart."""
    start, end = period(request)
    rows = {r["day"]: r for r in sold_orders(start, end).annotate(day=TruncDate("created_at"))
            .values("day").annotate(orders=Count("id"), revenue=Sum("total"))}
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    return Response([{"date": d, "orders": rows.get(d, {}).get("orders", 0),
                      "revenue": money(rows.get(d, {}).get("revenue"))} for d in days])


class TopProductSerializer(serializers.Serializer):
    product_name = serializers.CharField()
    label = serializers.CharField()
    quantity = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2, help_text="Item prices, before coupons")


@extend_schema(parameters=PERIOD + [OpenApiParameter("limit", int, description="Default 10, at most 50")],
               responses=TopProductSerializer(many=True))
@api_view(["GET"])
@permission_classes([IsAdminRole])
def top_products(request):
    start, end = period(request)
    try:
        limit = max(1, min(int(request.query_params.get("limit", 10)), 50))
    except ValueError:
        limit = 10
    rows = (OrderItem.objects.filter(order__in=sold_orders(start, end))
            .values("product_name", "label")
            .annotate(sold=Sum("quantity"), revenue=Sum(F("price") * F("quantity")))
            .order_by("-sold", "-revenue")[:limit])
    return Response([{"product_name": r["product_name"], "label": r["label"], "quantity": r["sold"],
                      "revenue": money(r["revenue"])} for r in rows])


class LowStockSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name")
    product_slug = serializers.CharField(source="product.slug")
    label = serializers.CharField()

    class Meta:
        model = Variant
        fields = ["id", "product_name", "product_slug", "label", "sku", "stock"]


@extend_schema(parameters=[OpenApiParameter("threshold", int, description="Stock at or below this. Default 5")],
               responses=LowStockSerializer(many=True))
@api_view(["GET"])
@permission_classes([IsStaffRole])
def low_stock(request):
    """Variants still on sale that are running out, emptiest first."""
    try:
        threshold = max(0, int(request.query_params.get("threshold", 5)))
    except ValueError:
        threshold = 5
    variants = (Variant.objects.filter(is_active=True, product__is_active=True, stock__lte=threshold)
                .select_related("product").order_by("stock", "product__name"))
    return Response(LowStockSerializer(variants, many=True).data)
