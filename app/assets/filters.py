from rest_framework import filters
from django.db.models import Q
from polymorphic.query_translate import translate_polymorphic_Q_object


class PolymorphicSearchFilter(filters.SearchFilter):
    """
    Search filter that supports polymorphic models by searching across child model fields.

    Usage:
        class MyViewSet(viewsets.ModelViewSet):
            filter_backends = [PolymorphicSearchFilter]
            polymorphic_search_fields = {
                'GlobalAssetTypeAttribute': ['^name', 'description'],
                'WorkspaceLocalAssetTypeAttribute': ['^name', '^api_key', 'description'],
            }

    Prefix meanings (same as DRF SearchFilter):
        ^ - istartswith
        = - iexact
        @ - search (full-text, requires setup)
        $ - iregex
        (none) - icontains
    """

    def get_polymorphic_search_fields(self, view):
        return getattr(view, "polymorphic_search_fields", {})

    def construct_search(self, field_name, child_model):
        """Build polymorphic lookup path with triple underscore syntax."""
        if field_name.startswith("^"):
            return f"{child_model}___{field_name[1:]}__istartswith"
        elif field_name.startswith("="):
            return f"{child_model}___{field_name[1:]}__iexact"
        elif field_name.startswith("@"):
            return f"{child_model}___{field_name[1:]}__search"
        elif field_name.startswith("$"):
            return f"{child_model}___{field_name[1:]}__iregex"
        return f"{child_model}___{field_name}__icontains"

    def filter_queryset(self, request, queryset, view):
        polymorphic_search_fields = self.get_polymorphic_search_fields(view)
        if not polymorphic_search_fields:
            return super().filter_queryset(request, queryset, view)

        search_terms = self.get_search_terms(request)
        if not search_terms:
            return queryset

        for search_term in search_terms:
            queries = Q()
            for child_model, fields in polymorphic_search_fields.items():
                for field in fields:
                    lookup = self.construct_search(field, child_model)
                    queries |= Q(**{lookup: search_term})

            # Translate polymorphic Q object to standard Django Q
            translated = translate_polymorphic_Q_object(queryset.model, queries)
            print(translated)
            queryset = queryset.filter(translated)

        return queryset
