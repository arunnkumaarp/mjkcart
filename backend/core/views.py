from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from .models import ShopSettings


class PublicShopSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopSettings
        fields = ["shop_name", "support_phone", "support_email", "upi_id", "upi_qr",
                  "cod_enabled", "cod_fee", "cod_max_order", "shipping_flat", "free_shipping_above"]


@extend_schema(responses=PublicShopSerializer)
@api_view(["GET"])
def shop(request):
    return Response(PublicShopSerializer(ShopSettings.load(), context={"request": request}).data)


@extend_schema(responses={200: dict})
@api_view(["GET"])
def health(request):
    return Response({"status": "ok"})
