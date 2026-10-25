from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import team, views

router = DefaultRouter()
router.register("me/addresses", views.AddressViewSet, basename="address")
router.register("staff/team", team.TeamViewSet, basename="team")

urlpatterns = [
    path("auth/otp/send/", views.send_otp, name="otp-send"),
    path("auth/otp/verify/", views.verify_otp, name="otp-verify"),
    path("auth/login/", views.password_login, name="password-login"),
    path("auth/signup/", views.signup, name="signup"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", views.me, name="me"),
    path("me/password/", views.set_password, name="set-password"),
] + router.urls
