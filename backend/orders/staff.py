import django_filters
from django.http import HttpResponse
from django.template.loader import render_to_string
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsStaffRole
from accounts.views import DetailSerializer

from core.models import ShopSettings

from .models import Courier, Order
from .status import NEXT, StatusError, change_status
from .views import OrderSerializer


class StaffOrderSerializer(OrderSerializer):
    customer_email = serializers.EmailField(source="user.email", read_only=True)
    next_statuses = serializers.SerializerMethodField()

    class Meta(OrderSerializer.Meta):
        fields = OrderSerializer.Meta.fields + ["customer_email", "next_statuses", "updated_at"]

    def get_next_statuses(self, order) -> list[str]:
        return [str(s) for s in NEXT[order.status]]


class StatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    # Needed when marking an order shipped.
    courier = serializers.PrimaryKeyRelatedField(queryset=Courier.objects.filter(is_active=True), required=False,
                                                 allow_null=True, default=None)
    tracking_number = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")


class CourierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Courier
        fields = ["id", "name", "tracking_url", "is_active"]


class CourierViewSet(viewsets.ReadOnlyModelViewSet):
    """Couriers to choose from when shipping. Add or edit them in Django admin."""

    serializer_class = CourierSerializer
    permission_classes = [IsStaffRole]
    pagination_class = None
    queryset = Courier.objects.filter(is_active=True)


def render_slips(orders):
    """Packing slip and address label per order, one order a page, ready to print."""
    return render_to_string("orders/slips.html", {"orders": orders, "shop": ShopSettings.load()})


class StaffOrderFilter(django_filters.FilterSet):
    placed_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    placed_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = Order
        fields = ["status", "payment_method"]


class StaffOrderViewSet(viewsets.ReadOnlyModelViewSet):
    """All orders for the shop team, newest first, with search by number, customer, phone or pincode."""

    serializer_class = StaffOrderSerializer
    permission_classes = [IsStaffRole]
    lookup_field = "number"
    queryset = Order.objects.select_related("user", "courier").prefetch_related("items", "events", "payment_proofs")
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.SearchFilter]
    filterset_class = StaffOrderFilter
    search_fields = ["number", "user__email", "ship_name", "ship_phone", "ship_pincode"]

    @extend_schema(request=StatusChangeSerializer, responses={200: StaffOrderSerializer, 400: DetailSerializer})
    @action(detail=True, methods=["post"])
    def status(self, request, number=None):
        s = StatusChangeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            change_status(self.get_object(), s.validated_data["status"], request.user, s.validated_data["note"],
                          courier=s.validated_data["courier"], tracking_number=s.validated_data["tracking_number"])
        except StatusError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(self.get_queryset().get(number=number)).data)

    @extend_schema(parameters=[OpenApiParameter("numbers", str, required=True,
                                                description="Comma-separated order numbers, e.g. MJK000001,MJK000002")],
                   responses={(200, "text/html"): OpenApiTypes.STR})
    @action(detail=False, methods=["get"])
    def slips(self, request):
        numbers = [n.strip() for n in request.query_params.get("numbers", "").split(",") if n.strip()]
        orders = list(self.get_queryset().filter(number__in=numbers).order_by("number"))
        if not orders:
            return Response({"detail": "No orders found."}, status=status.HTTP_404_NOT_FOUND)
        return HttpResponse(render_slips(orders))
