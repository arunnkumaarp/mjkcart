from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("products", views.ProductViewSet, basename="product")
router.register("categories", views.CategoryViewSet, basename="category")
router.register("variants", views.VariantViewSet, basename="variant")
router.register("product-images", views.ProductImageViewSet, basename="product-image")

urlpatterns = router.urls
