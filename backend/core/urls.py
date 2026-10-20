from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("shop/", views.shop, name="shop"),
]
