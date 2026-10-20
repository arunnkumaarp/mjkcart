from rest_framework import serializers, viewsets

from accounts.permissions import IsAdminRole

from .models import Coupon


class CouponSerializer(serializers.ModelSerializer):
    times_used = serializers.SerializerMethodField()

    class Meta:
        model = Coupon
        fields = ["id", "code", "description", "kind", "value", "max_discount", "min_order", "starts_at", "ends_at",
                  "usage_limit", "per_customer_limit", "is_active", "times_used", "created_at"]
        read_only_fields = ["created_at"]

    def get_times_used(self, coupon) -> int:
        return coupon.uses()

    def validate_code(self, code):
        code = code.strip().upper()
        if Coupon.objects.filter(code=code).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError("A coupon with this code already exists.")
        return code

    def validate(self, attrs):
        get = lambda f: attrs.get(f, getattr(self.instance, f, None))
        if get("value") is not None and get("value") <= 0:
            raise serializers.ValidationError({"value": "Must be more than zero."})
        if get("kind") == Coupon.Kind.PERCENT and get("value") and get("value") > 100:
            raise serializers.ValidationError({"value": "A percent discount can't be over 100."})
        if get("starts_at") and get("ends_at") and get("ends_at") <= get("starts_at"):
            raise serializers.ValidationError({"ends_at": "Must be after the start."})
        return attrs


class CouponViewSet(viewsets.ModelViewSet):
    """Admins only. Removing a coupon switches it off; orders that used it keep the code."""

    serializer_class = CouponSerializer
    permission_classes = [IsAdminRole]
    queryset = Coupon.objects.all()
    search_fields = ["code", "description"]
    filterset_fields = ["is_active", "kind"]

    def perform_destroy(self, coupon):
        coupon.is_active = False
        coupon.save(update_fields=["is_active"])
