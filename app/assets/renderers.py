from djangorestframework_camel_case.render import (
    CamelCaseJSONRenderer,
    CamelCaseBrowsableAPIRenderer,
)


class AssetCamelCaseJSONRenderer(CamelCaseJSONRenderer):
    """Custom renderer that preserves original keys in the 'attributes' field"""

    json_underscoreize = {
        "ignore_fields": ("attributes",),
    }


class AssetCamelCaseBrowsableAPIRenderer(CamelCaseBrowsableAPIRenderer):
    """Custom browsable API renderer that preserves original keys in the 'attributes' field"""

    json_underscoreize = {
        "ignore_fields": ("attributes",),
    }
