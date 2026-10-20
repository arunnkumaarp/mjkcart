from django.urls import path
from rest_framework.routers import DefaultRouter

from . import staff, views

router = DefaultRouter()
router.register("staff/orders", staff.StaffOrderViewSet, basename="staff-order")

urlpatterns = [
    path("cart/", views.cart, name="cart"),
    path("cart/items/", views.add_item, name="cart-add"),
    path("cart/items/<int:pk>/", views.item, name="cart-item"),
    path("cart/merge/", views.merge, name="cart-merge"),
    path("checkout/quote/", views.checkout_quote, name="checkout-quote"),
    path("orders/", views.orders, name="orders"),
    path("orders/<str:number>/", views.order_detail, name="order-detail"),
    path("orders/<str:number>/cancel/", views.cancel_order, name="order-cancel"),
] + router.urls
