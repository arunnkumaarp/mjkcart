from django.db import migrations

COURIERS = [
    ("DHL", "https://www.dhl.com/in-en/home/tracking/tracking-express.html?submit=1&tracking-id={number}"),
    # No public per-number link known; customers get the tracking site and their number. Edit in admin if needed.
    ("The Professional Couriers", "https://www.tpcindia.com/"),
]


def add(apps, schema_editor):
    Courier = apps.get_model("orders", "Courier")
    for i, (name, url) in enumerate(COURIERS):
        Courier.objects.get_or_create(name=name, defaults={"tracking_url": url, "sort_order": i})


class Migration(migrations.Migration):
    dependencies = [("orders", "0005_courier_tracking")]
    operations = [migrations.RunPython(add, migrations.RunPython.noop)]
