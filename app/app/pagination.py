from rest_framework.pagination import PageNumberPagination, LimitOffsetPagination


class CustomPageNumberPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 10_000


class CustomLimitOffsetPagination(LimitOffsetPagination):
    default_limit = 100
    max_limit = 1000
