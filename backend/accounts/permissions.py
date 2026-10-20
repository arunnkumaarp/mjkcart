from rest_framework.permissions import BasePermission


class IsAdminRole(BasePermission):
    """Owners and admins: everything, including money, reports, settings and team."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_shop_admin)


class IsStaffRole(BasePermission):
    """Admins plus staff: orders, payment checks, dispatch, products and stock."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_shop_staff)
