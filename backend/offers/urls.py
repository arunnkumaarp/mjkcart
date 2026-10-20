from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("staff/coupons", views.CouponViewSet, basename="staff-coupon")

urlpatterns = router.urls
