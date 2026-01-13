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


class ScopeFilter(filters.BaseFilterBackend):
    """
    Filter attributes by scope (global, override, local).

    Usage:
        ?scope=global,override  (include only global and override)
        ?exclude_scope=local    (exclude local, include global and override)
    """

    def filter_queryset(self, request, queryset, view):
        # Check for scope inclusion filter
        scope_param = request.query_params.get("scope")
        exclude_scope_param = request.query_params.get("exclude_scope")

        if scope_param:
            scopes = [s.strip() for s in scope_param.split(",")]
            scope_q = Q()
            for scope in scopes:
                if scope == "global":
                    scope_q |= Q(polymorphic_ctype__model="globalassettypeattribute")
                elif scope == "override":
                    scope_q |= Q(
                        polymorphic_ctype__model="workspaceoverrideassettypeattribute"
                    )
                elif scope == "local":
                    scope_q |= Q(
                        polymorphic_ctype__model="workspacelocalassettypeattribute"
                    )
            queryset = queryset.filter(scope_q)

        if exclude_scope_param:
            scopes = [s.strip() for s in exclude_scope_param.split(",")]
            for scope in scopes:
                if scope == "global":
                    queryset = queryset.exclude(
                        polymorphic_ctype__model="globalassettypeattribute"
                    )
                elif scope == "override":
                    queryset = queryset.exclude(
                        polymorphic_ctype__model="workspaceoverrideassettypeattribute"
                    )
                elif scope == "local":
                    queryset = queryset.exclude(
                        polymorphic_ctype__model="workspacelocalassettypeattribute"
                    )

        return queryset


class TagsFilter(filters.BaseFilterBackend):
    """
    Filter attributes by tags (polymorphic - searches across global, override, and local).

    Usage:
        ?tags=infrastructure,network  (attributes must have at least one of these tags)
    """

    def filter_queryset(self, request, queryset, view):
        tags_param = request.query_params.get("tags")
        if not tags_param:
            return queryset

        tags = [t.strip() for t in tags_param.split(",")]

        # Build polymorphic Q to search tags across all child models
        tag_q = Q()
        for tag in tags:
            # Global attributes
            tag_q |= Q(GlobalAssetTypeAttribute___tags__contains=[tag])
            # Override attributes
            tag_q |= Q(WorkspaceOverrideAssetTypeAttribute___tags__contains=[tag])
            # Local attributes
            tag_q |= Q(WorkspaceLocalAssetTypeAttribute___tags__contains=[tag])

        translated = translate_polymorphic_Q_object(queryset.model, tag_q)
        return queryset.filter(translated)


class HiddenFilter(filters.BaseFilterBackend):
    """
    Filter attributes by hidden status.

    Usage:
        ?include_hidden=true   (show all attributes including hidden)
        ?include_hidden=false  (exclude hidden attributes, show only non-hidden)
        (no param)             (show all attributes by default)
    """

    def filter_queryset(self, request, queryset, view):
        include_hidden_param = request.query_params.get("include_hidden")
        if include_hidden_param is None:
            return queryset

        # Convert string to boolean
        include_hidden = include_hidden_param.lower() in ("true", "1", "yes")

        # If include_hidden is False, exclude hidden attributes
        if not include_hidden:
            return queryset.filter(_is_hidden=False)

        # If include_hidden is True, return all (don't filter)
        return queryset
