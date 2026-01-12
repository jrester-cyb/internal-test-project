from django.db import models
import uuid
from core.models.soft_delete import SoftDeleteMixin


class AssetType(SoftDeleteMixin):
    """Defines a type of asset with its field schema"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace", on_delete=models.CASCADE, related_name="asset_types"
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(SoftDeleteMixin.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                name="unique_workspace_asset_type_name",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]
        ordering = ["workspace", "name"]

    def __str__(self):
        return self.name
