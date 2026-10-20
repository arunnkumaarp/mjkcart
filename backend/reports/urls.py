from django.urls import path

from . import views

urlpatterns = [
    path("staff/reports/summary/", views.summary, name="report-summary"),
    path("staff/reports/daily/", views.daily, name="report-daily"),
    path("staff/reports/top-products/", views.top_products, name="report-top-products"),
    path("staff/reports/low-stock/", views.low_stock, name="report-low-stock"),
]
