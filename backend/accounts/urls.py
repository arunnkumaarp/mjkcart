from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

router = DefaultRouter()
router.register("me/addresses", views.AddressViewSet, basename="address")

urlpatterns = [
    path("auth/otp/send/", views.send_otp, name="otp-send"),
    path("auth/otp/verify/", views.verify_otp, name="otp-verify"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", views.me, name="me"),
] + router.urls
