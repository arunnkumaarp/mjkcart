import logging
import smtplib

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_field, inline_serializer
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import ShopSettings

from .models import Address, EmailOTP, User

log = logging.getLogger(__name__)


class EmailSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class VerifySerializer(EmailSerializer):
    code = serializers.RegexField(r"^\d{6}$")


class UserSerializer(serializers.ModelSerializer):
    # Superusers count as shop admins in the app too.
    role = serializers.SerializerMethodField()

    @extend_schema_field(serializers.ChoiceField(choices=User.Role.choices))
    def get_role(self, user):
        return User.Role.ADMIN if user.is_shop_admin else user.role

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "phone", "role"]
        read_only_fields = ["id", "email", "role"]


class DetailSerializer(serializers.Serializer):
    detail = serializers.CharField()


class AddressSerializer(serializers.ModelSerializer):
    phone = serializers.RegexField(r"^[6-9]\d{9}$", error_messages={"invalid": "Enter a 10-digit mobile number."})
    pincode = serializers.RegexField(r"^[1-9]\d{5}$", error_messages={"invalid": "Enter a 6-digit pincode."})

    class Meta:
        model = Address
        fields = ["id", "name", "phone", "line1", "line2", "landmark", "city", "state", "pincode", "is_default"]


@extend_schema(request=EmailSerializer, responses=DetailSerializer)
@api_view(["POST"])
def send_otp(request):
    s = EmailSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    email = s.validated_data["email"]

    last = EmailOTP.latest_for(email)
    if last and timezone.now() - last.created_at < EmailOTP.RESEND_AFTER:
        return Response({"detail": "Please wait a minute before requesting another code."},
                        status=status.HTTP_429_TOO_MANY_REQUESTS)

    code = EmailOTP.issue(email)
    shop = ShopSettings.load().shop_name
    try:
        send_mail(
            subject=f"{code} is your {shop} login code",
            message=f"Your {shop} login code is {code}.\nIt expires in 10 minutes. "
                    "If you didn't ask for it, ignore this email.",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
        )
    except (smtplib.SMTPException, OSError):
        log.exception("Could not email the login code to %s", email)
        return Response({"detail": "We couldn't send the email just now. Please try again in a minute."},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return Response({"detail": "Code sent."})


@extend_schema(request=VerifySerializer, responses=inline_serializer("LoginResponse", {
    "access": serializers.CharField(), "refresh": serializers.CharField(), "user": UserSerializer()}))
@api_view(["POST"])
def verify_otp(request):
    s = VerifySerializer(data=request.data)
    s.is_valid(raise_exception=True)
    email, code = s.validated_data["email"], s.validated_data["code"]

    otp = EmailOTP.latest_for(email)
    if not otp or not otp.check_code(code):
        return Response({"detail": "Wrong or expired code."}, status=status.HTTP_400_BAD_REQUEST)

    # Match existing accounts by email too, so admins made with createsuperuser can log in here.
    user = User.objects.filter(email__iexact=email).order_by("id").first() or \
        User.objects.create(username=email, email=email)
    if not user.is_active:
        return Response({"detail": "Account disabled."}, status=status.HTTP_403_FORBIDDEN)
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    refresh = RefreshToken.for_user(user)
    return Response({"access": str(refresh.access_token), "refresh": str(refresh),
                     "user": UserSerializer(user).data})


@extend_schema(request=UserSerializer, responses=UserSerializer)
@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request):
    if request.method == "PATCH":
        s = UserSerializer(request.user, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
    return Response(UserSerializer(request.user).data)


class AddressViewSet(viewsets.ModelViewSet):
    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # schema generation has no user
            return Address.objects.none()
        return self.request.user.addresses.all()

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
