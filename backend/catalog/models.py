from django.db import models
from django.utils.text import slugify


def unique_slug(instance, value, max_length):
    """Slug from value, with -2, -3… added when another row of the same model already has it."""
    base = slugify(value)[: max_length - 6] or instance._meta.model_name
    slug, n = base, 2
    model = type(instance)
    while model.objects.filter(slug=slug).exclude(pk=instance.pk).exists():
        slug, n = f"{base}-{n}", n + 1
    return slug


class Category(models.Model):
    """A shelf in the shop. Categories can nest, e.g. Tea > Green tea."""

    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=100, unique=True, blank=True)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return f"{self.parent} > {self.name}" if self.parent_id else self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(self, self.name, 100)
        super().save(*args, **kwargs)

    def descendant_ids(self):
        """This category and every category under it."""
        ids, frontier = [self.pk], [self.pk]
        while frontier:
            frontier = list(Category.objects.filter(parent_id__in=frontier).values_list("pk", flat=True))
            ids += frontier
        return ids


class Product(models.Model):
    """Something the shop sells. Price and stock live on its variants; removing a product hides it."""

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.TextField(blank=True, default="")
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="products")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(self, self.name, 140)
        super().save(*args, **kwargs)


class Variant(models.Model):
    """One buyable option of a product, e.g. 250g or Red / M, with its own price and stock."""

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    size = models.CharField(max_length=40, blank=True, default="")
    colour = models.CharField(max_length=40, blank=True, default="")
    sku = models.CharField(max_length=40, unique=True, null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    # MRP is printed on the pack; when it is above the price the app shows the discount.
    mrp = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stock = models.PositiveIntegerField(default=0)
    # Packed weight, for couriers that charge by weight.
    weight_grams = models.PositiveIntegerField(default=0)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "price"]

    def __str__(self):
        return f"{self.product} ({self.label})" if self.label else str(self.product)

    @property
    def label(self):
        return " / ".join(v for v in (self.colour, self.size) if v)


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="products/")
    alt = models.CharField(max_length=120, blank=True, default="")
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"{self.product} image {self.sort_order}"
