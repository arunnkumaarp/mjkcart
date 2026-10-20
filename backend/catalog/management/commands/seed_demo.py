from django.core.management.base import BaseCommand

from catalog.models import Category, Product, Variant

# Sample catalog for development and design reviews. Replace with the shop's real products.
DEMO = {
    "Pantry": [
        ("Filter coffee powder", "Peaberry and plantation A, roasted dark with 20% chicory, ground for a steel filter.",
         [("250g", 240, 280, 40, 270), ("500g", 450, 520, 25, 520)]),
        ("Masala chai blend", "Assam CTC with cardamom, ginger, clove and black pepper. Boil it with milk.",
         [("200g", 180, 200, 60, 220)]),
        ("Cold-pressed groundnut oil", "Pressed slowly in a wooden chekku, unrefined, for everyday cooking.",
         [("1 litre", 390, None, 30, 980), ("2 litres", 760, None, 4, 1950)]),
    ],
    "Home and kitchen": [
        ("Brass diya, set of two", "Solid brass oil lamps, hand-polished, about 7cm across.",
         [("Set of two", 650, 750, 12, 400)]),
        ("Copper water bottle", "Seamless copper, leak-proof cap, one litre.",
         [("1 litre", 899, 1199, 18, 450)]),
    ],
    "Textiles": [
        ("Handloom cotton towel", "Woven on a pit loom, soft after the first wash, quick to dry.",
         [("Indigo", 320, None, 3, 300), ("Turmeric", 320, None, 20, 300), ("Natural", 300, None, 0, 300)]),
        ("Block-printed cushion cover", "Hand block-printed with vegetable dyes on cotton, 16 × 16 inches.",
         [("Madder red", 450, 550, 15, 150), ("Indigo", 450, 550, 9, 150)]),
    ],
    "Stationery": [
        ("Handmade paper notebook", "Cotton rag paper, thread-bound, 120 unlined pages.",
         [("A5", 260, None, 35, 250), ("A6", 180, None, 50, 140)]),
    ],
    "Personal care": [
        ("Neem wood comb", "Wide teeth, cut and smoothed by hand, no varnish.",
         [("Wide tooth", 150, None, 80, 30)]),
        ("Kumkumadi face oil", "Saffron and sandalwood in sesame oil, 30ml amber bottle.",
         [("30ml", 595, 695, 2, 90)]),
    ],
}


class Command(BaseCommand):
    help = "Adds a sample catalog for development. Safe to run more than once."

    def handle(self, *args, **options):
        for order, (cat_name, products) in enumerate(DEMO.items()):
            category, _ = Category.objects.get_or_create(name=cat_name, defaults={"sort_order": order})
            for name, description, variants in products:
                product, created = Product.objects.get_or_create(
                    name=name, defaults={"description": description, "category": category})
                if not created:
                    continue
                for i, (size, price, mrp, stock, grams) in enumerate(variants):
                    colour = size if cat_name == "Textiles" else ""
                    Variant.objects.create(product=product, size="" if colour else size, colour=colour,
                                           price=price, mrp=mrp, stock=stock, weight_grams=grams, sort_order=i,
                                           sku=f"{product.slug[:12].upper()}-{i + 1}")
        self.stdout.write(self.style.SUCCESS(f"Demo catalog ready: {Product.objects.count()} products."))
