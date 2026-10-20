import django_filters
from drf_spectacular.utils import extend_schema
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsStaffRole
from accounts.views import DetailSerializer

from .models import Order
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
    queryset = Order.objects.select_related("user").prefetch_related("items", "events")
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend, filters.SearchFilter]
    filterset_class = StaffOrderFilter
    search_fields = ["number", "user__email", "ship_name", "ship_phone", "ship_pincode"]

    @extend_schema(request=StatusChangeSerializer, responses={200: StaffOrderSerializer, 400: DetailSerializer})
    @action(detail=True, methods=["post"])
    def status(self, request, number=None):
        s = StatusChangeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            change_status(self.get_object(), s.validated_data["status"], request.user, s.validated_data["note"])
        except StatusError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(self.get_queryset().get(number=number)).data)
