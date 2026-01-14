from rest_framework.pagination import (
    PageNumberPagination,
    LimitOffsetPagination,
    CursorPagination,
)


class CustomPageNumberPagination(PageNumberPagination):
    """
    Page number pagination.
    Use: ?page=2&page_size=50
    """

    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 10_000


class CustomLimitOffsetPagination(LimitOffsetPagination):
    """
    Limit/offset pagination.
    Use: ?limit=50&offset=100
    """

    default_limit = 100
    max_limit = 10_000


class CustomCursorPagination(CursorPagination):
    """
    Cursor pagination for large datasets.
    Use: ?cursor=<opaque_cursor>

    Requires ordering to be set on the view or a default ordering field.
    Most efficient for large datasets as it doesn't need COUNT queries.
    """

    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 1000
    ordering = "-id"  # Default ordering, can be overridden per-view
