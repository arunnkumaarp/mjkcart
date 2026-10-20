from rest_framework.pagination import PageNumberPagination


class Pagination(PageNumberPagination):
    """?page=2&page_size=48; 24 a page suits a 2-, 3- or 4-column product grid."""

    page_size = 24
    page_size_query_param = "page_size"
    max_page_size = 100
