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


class FlexiblePagination(PageNumberPagination):
    """
    Flexible pagination that supports both page number and limit/offset styles.

    Automatically detects which style to use based on query parameters:
    - If 'limit' or 'offset' params are present: Use limit/offset style
    - Otherwise: Use page number style (default)

    Page number style: ?page=2&page_size=50
    Limit/offset style: ?limit=50&offset=100
    """

    # Page number style settings
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 10_000

    # Limit/offset style settings
    limit_query_param = "limit"
    offset_query_param = "offset"
    default_limit = 100
    max_limit = 10_000

    def _is_limit_offset_style(self, request):
        """Check if the request uses limit/offset style."""
        return (
            self.limit_query_param in request.query_params
            or self.offset_query_param in request.query_params
        )

    def paginate_queryset(self, queryset, request, view=None):
        """
        Paginate the queryset using the appropriate style.
        """
        if self._is_limit_offset_style(request):
            # Use limit/offset style
            self._use_limit_offset = True
            self.limit = self.get_limit(request)
            if self.limit is None:
                return None

            self.count = self.get_count(queryset)
            self.offset = self.get_offset(request)
            self.request = request

            if self.count == 0 or self.offset > self.count:
                return []

            return list(queryset[self.offset : self.offset + self.limit])
        else:
            # Use page number style (default behavior)
            self._use_limit_offset = False
            return super().paginate_queryset(queryset, request, view)

    def get_limit(self, request):
        """Get the limit from request, with validation."""
        try:
            limit = int(
                request.query_params.get(self.limit_query_param, self.default_limit)
            )
            return min(limit, self.max_limit) if limit > 0 else self.default_limit
        except (ValueError, TypeError):
            return self.default_limit

    def get_offset(self, request):
        """Get the offset from request."""
        try:
            offset = int(request.query_params.get(self.offset_query_param, 0))
            return max(offset, 0)
        except (ValueError, TypeError):
            return 0

    def get_count(self, queryset):
        """Get the total count of items in the queryset."""
        try:
            return queryset.count()
        except (AttributeError, TypeError):
            return len(queryset)

    def get_paginated_response(self, data):
        """
        Return the paginated response using the appropriate format.
        Both styles return the same format for consistency.
        """
        if getattr(self, "_use_limit_offset", False):
            return self._get_limit_offset_response(data)
        return super().get_paginated_response(data)

    def _get_limit_offset_response(self, data):
        """Build limit/offset style response."""
        from rest_framework.response import Response

        next_url = self.get_next_link_limit_offset()
        previous_url = self.get_previous_link_limit_offset()

        return Response(
            {
                "count": self.count,
                "next": next_url,
                "previous": previous_url,
                "results": data,
            }
        )

    def get_next_link_limit_offset(self):
        """Get the next page URL for limit/offset style."""
        if self.offset + self.limit >= self.count:
            return None

        url = self.request.build_absolute_uri()
        offset = self.offset + self.limit

        from rest_framework.utils.urls import replace_query_param

        url = replace_query_param(url, self.limit_query_param, self.limit)
        url = replace_query_param(url, self.offset_query_param, offset)
        return url

    def get_previous_link_limit_offset(self):
        """Get the previous page URL for limit/offset style."""
        if self.offset <= 0:
            return None

        url = self.request.build_absolute_uri()
        offset = max(self.offset - self.limit, 0)

        from rest_framework.utils.urls import replace_query_param

        url = replace_query_param(url, self.limit_query_param, self.limit)
        if offset:
            url = replace_query_param(url, self.offset_query_param, offset)
        else:
            # Remove offset param if it's 0
            from rest_framework.utils.urls import remove_query_param

            url = remove_query_param(url, self.offset_query_param)
        return url
