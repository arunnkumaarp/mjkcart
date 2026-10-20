from django.urls import path

from . import views

urlpatterns = [
    path("cart/", views.cart, name="cart"),
    path("cart/items/", views.add_item, name="cart-add"),
    path("cart/items/<int:pk>/", views.item, name="cart-item"),
    path("cart/merge/", views.merge, name="cart-merge"),
]
