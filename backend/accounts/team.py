import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Q
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.response import Response

from core.models import ShopSettings

from .models import User
from .permissions import IsAdminRole

log = logging.getLogger(__name__)
R = User.Role
TEAM_ROLES = [(R.STAFF, R.STAFF.label), (R.ADMIN, R.ADMIN.label)]


def team():
    return User.objects.filter(Q(role__in=[R.STAFF, R.ADMIN]) | Q(is_superuser=True))


class MemberSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=TEAM_ROLES)

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "phone", "role", "is_superuser", "last_login", "date_joined"]
        read_only_fields = ["email", "phone", "is_superuser", "last_login", "date_joined"]

    def to_representation(self, user):
        data = super().to_representation(user)
        if user.is_superuser:
            data["role"] = R.ADMIN
        return data


class InviteSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    role = serializers.ChoiceField(choices=TEAM_ROLES)

    def validate_email(self, email):
        return email.strip().lower()


class TeamViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                  mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Admins add staff by email, change roles, and remove people from the team (they stay customers)."""

    serializer_class = MemberSerializer
    permission_classes = [IsAdminRole]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        return team().order_by("email")

    def refuse(self, user):
        """Why this person's role can't be changed, or None. Admins can't change themselves,
        so the shop always keeps at least the admin making the change."""
        if user == self.request.user:
            return "You can't change your own role. Ask another admin."
        if user.is_superuser:
            return "Owner accounts (superusers) are always admins; change them in Django admin."
        return None

    def create(self, request):
        """Add someone to the team. An existing customer account is promoted; otherwise one is made."""
        s = InviteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        email, role = s.validated_data["email"], s.validated_data["role"]
        user = User.objects.filter(email__iexact=email).order_by("id").first()
        if user and (user.is_superuser or user.role != R.CUSTOMER):
            return Response({"email": ["This person is already in the team."]}, status=status.HTTP_400_BAD_REQUEST)
        if not user:
            user = User(username=email, email=email)
        user.role = role
        user.first_name = s.validated_data["first_name"] or user.first_name
        user.save()
        send_invite(user)
        return Response(MemberSerializer(user).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        new_role = serializer.validated_data.get("role", serializer.instance.role)
        if new_role != serializer.instance.role and (reason := self.refuse(serializer.instance)):
            raise serializers.ValidationError({"role": [reason]})
        serializer.save()

    def destroy(self, request, pk=None):
        user = self.get_object()
        if reason := self.refuse(user):
            return Response({"detail": reason}, status=status.HTTP_400_BAD_REQUEST)
        user.role = R.CUSTOMER
        user.save(update_fields=["role"])
        return Response(status=status.HTTP_204_NO_CONTENT)


def send_invite(user):
    shop = ShopSettings.load().shop_name
    link = f"\n\nLog in here: {settings.FRONTEND_URL.rstrip('/')}/login" if settings.FRONTEND_URL else ""
    try:
        send_mail(
            subject=f"You've been added to the {shop} team",
            message=f"Hi{' ' + user.first_name if user.first_name else ''},\n\n"
                    f"You now have {user.get_role_display().lower()} access to {shop}. "
                    f"Log in with this email address ({user.email}); we'll send you a login code.{link}",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
        )
    except Exception:  # The person is added either way; an admin can tell them directly.
        log.exception("Could not send the team invite to %s", user.email)
