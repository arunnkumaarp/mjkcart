import django_filters
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsStaffRole
from accounts.views import DetailSerializer

from .emails import notify
from .models import Order, PaymentProof
from .status import change_status
from .views import OrderSerializer, my_orders

P = PaymentProof.Status


class PaymentProofSerializer(serializers.ModelSerializer):
    reference = serializers.RegexField(r"^[A-Za-z0-9]{6,30}$", required=False, allow_blank=True,
                                       error_messages={"invalid": "Enter the UPI reference (UTR) from your payment app."})
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = PaymentProof
        fields = ["id", "reference", "screenshot", "status", "status_label", "reject_reason", "submitted_at"]
        read_only_fields = ["status", "reject_reason", "submitted_at"]

    def validate(self, attrs):
        reference = attrs.get("reference", "").upper()
        if not reference and not attrs.get("screenshot"):
            raise serializers.ValidationError("Add the UPI reference number or a screenshot of the payment.")
        if reference and PaymentProof.objects.filter(reference=reference).exclude(status=P.REJECTED).exists():
            raise serializers.ValidationError({"reference": "This reference was already used for another payment."})
        attrs["reference"] = reference
        return attrs


@extend_schema(request={"multipart/form-data": PaymentProofSerializer},
               responses={201: OrderSerializer, 400: DetailSerializer},
               description="Send proof of a UPI payment: the reference (UTR), a screenshot, or both.")
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def submit_payment(request, number):
    order = get_object_or_404(request.user.orders, number=number)
    if order.payment_method != Order.Payment.UPI or order.status != Order.Status.PAYMENT_PENDING:
        return Response({"detail": "This order isn't waiting for a UPI payment."}, status=status.HTTP_400_BAD_REQUEST)
    if order.payment_proofs.filter(status=P.SUBMITTED).exists():
        return Response({"detail": "We're already checking your payment."}, status=status.HTTP_400_BAD_REQUEST)
    s = PaymentProofSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    s.save(order=order)
    notify(order, "payment_submitted")
    return Response(OrderSerializer(my_orders(request).get(pk=order.pk), context={"request": request}).data,
                    status=status.HTTP_201_CREATED)


class StaffPaymentSerializer(PaymentProofSerializer):
    order_number = serializers.CharField(source="order.number", read_only=True)
    order_total = serializers.DecimalField(source="order.total", max_digits=12, decimal_places=2, read_only=True)
    customer_email = serializers.EmailField(source="order.user.email", read_only=True)

    class Meta(PaymentProofSerializer.Meta):
        fields = PaymentProofSerializer.Meta.fields + ["order_number", "order_total", "customer_email", "reviewed_at"]


class RejectSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=200)


class StaffPaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """The payment check queue: ?status=submitted shows what still needs checking, oldest last."""

    serializer_class = StaffPaymentSerializer
    permission_classes = [IsStaffRole]
    queryset = PaymentProof.objects.select_related("order__user")
    filter_backends = [django_filters.rest_framework.DjangoFilterBackend]
    filterset_fields = ["status"]

    def review(self, request, verified, reason=""):
        with transaction.atomic():
            proof = PaymentProof.objects.select_for_update().get(pk=self.get_object().pk)
            if proof.status != P.SUBMITTED:
                return Response({"detail": f"This payment was already {proof.get_status_display().lower()}."},
                                status=status.HTTP_400_BAD_REQUEST)
            if verified and proof.order.status != Order.Status.PAYMENT_PENDING:
                # e.g. the customer cancelled while the payment was being checked; refund by hand.
                return Response({"detail": f"Order is {proof.order.get_status_display().lower()}; "
                                           "it can't be confirmed. Refund the payment if it arrived."},
                                status=status.HTTP_400_BAD_REQUEST)
            proof.status = P.VERIFIED if verified else P.REJECTED
            proof.reject_reason = reason
            proof.reviewed_by, proof.reviewed_at = request.user, timezone.now()
            proof.save()
            note = f"UPI payment {proof.reference}".strip() + (" verified" if verified else f" rejected: {reason}")
            if verified:
                change_status(proof.order, Order.Status.CONFIRMED, request.user, note)
            else:
                proof.order.events.create(status=proof.order.status, note=note, by=request.user)
                notify(proof.order, "payment_rejected", reason)
        return Response(self.get_serializer(proof).data)

    @extend_schema(request=None, responses={200: StaffPaymentSerializer, 400: DetailSerializer},
                   description="The money is in the shop's account: confirm the order.")
    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        return self.review(request, verified=True)

    @extend_schema(request=RejectSerializer, responses={200: StaffPaymentSerializer, 400: DetailSerializer},
                   description="The payment can't be found; the customer is asked to send proof again.")
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        s = RejectSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return self.review(request, verified=False, reason=s.validated_data["reason"])
