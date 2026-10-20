from decimal import Decimal

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.permissions import IsAdminRole

from .models import ShopSettings


class PublicShopSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopSettings
        fields = ["shop_name", "logo", "tagline", "story", "support_phone", "support_email", "upi_id", "upi_qr",
                  "cod_enabled", "cod_fee", "cod_max_order", "shipping_flat", "free_shipping_above"]


@extend_schema(responses=PublicShopSerializer)
@api_view(["GET"])
def shop(request):
    return Response(PublicShopSerializer(ShopSettings.load(), context={"request": request}).data)


@extend_schema(responses={200: dict})
@api_view(["GET"])
def health(request):
    return Response({"status": "ok"})


class ShopSettingsSerializer(PublicShopSerializer):
    support_phone = serializers.RegexField(r"^([6-9]\d{9})?$", required=False, allow_blank=True,
                                           error_messages={"invalid": "Enter a 10-digit mobile number."})
    upi_id = serializers.RegexField(r"^([\w.\-]{2,}@[A-Za-z]{2,})?$", required=False, allow_blank=True,
                                    error_messages={"invalid": "Enter a UPI ID like shopname@okaxis."})
    upi_qr = serializers.ImageField(required=False, allow_null=True)
    logo = serializers.ImageField(required=False, allow_null=True)

    class Meta(PublicShopSerializer.Meta):
        pass

    def validate(self, attrs):
        for field in ["cod_fee", "shipping_flat", "free_shipping_above"]:
            if attrs.get(field, Decimal("0")) < 0:
                raise serializers.ValidationError({field: "Can't be negative."})
        if "cod_max_order" in attrs and attrs["cod_max_order"] <= 0:
            raise serializers.ValidationError({"cod_max_order": "Must be more than zero."})
        return attrs

    def update(self, shop, validated_data):
        # Sending an image field empty removes that image.
        for field in ("upi_qr", "logo"):
            if field in validated_data and not validated_data[field] and getattr(shop, field):
                getattr(shop, field).delete(save=False)
        return super().update(shop, validated_data)


@extend_schema(methods=["GET"], responses=ShopSettingsSerializer)
@extend_schema(methods=["PATCH"], request={"application/json": ShopSettingsSerializer,
                                           "multipart/form-data": ShopSettingsSerializer},
               responses=ShopSettingsSerializer,
               description="Admins edit the shop's name, logo, tagline, story, contacts, UPI, COD and delivery fees. "
                           "Upload logo or upi_qr as multipart form data; send one empty to remove it.")
@api_view(["GET", "PATCH"])
@permission_classes([IsAdminRole])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def shop_settings(request):
    shop = ShopSettings.load()
    if request.method == "PATCH":
        s = ShopSettingsSerializer(shop, data=request.data, partial=True, context={"request": request})
        s.is_valid(raise_exception=True)
        s.save()
    return Response(ShopSettingsSerializer(shop, context={"request": request}).data)
