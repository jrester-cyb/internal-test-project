import uuid
from django.db import models
from django.core.exceptions import ValidationError
from polymorphic.models import PolymorphicModel
import pgtrigger
from core.models.soft_delete import PolymorphicSoftDeleteMixin


def file_upload_path(instance, filename):
    """Generate upload path: files/<workspace_id>/<uuid>/<filename>"""
    return f"files/{instance.workspace_id}/{uuid.uuid4()}/{filename}"


class FileNode(PolymorphicSoftDeleteMixin, PolymorphicModel):
    """
    Base model for file system entries.
    Uses tree structure with parent FK for efficient folder listing.
    Polymorphic to support different file types with specific metadata.

    Hierarchy rules:
    - Directory can have parent=None (root) or parent=Directory
    - Only one root Directory per workspace
    - All file types (Image, Document, etc.) must have a Directory parent
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Tree structure - parent must be a Directory
    name = models.CharField(max_length=255, help_text="File or folder name")
    parent = models.ForeignKey(
        "files_manager.Directory",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
        help_text="Parent directory (null only for root directory)",
    )

    # Ownership
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="file_nodes",
        help_text="Workspace this file/folder belongs to (for access control)",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(PolymorphicSoftDeleteMixin.Meta):
        ordering = ["name"]
        indexes = [
            models.Index(fields=["workspace", "parent"]),
        ]
        constraints = [
            # Unique name within same parent folder for same workspace
            models.UniqueConstraint(
                fields=["workspace", "parent", "name"],
                name="unique_name_in_folder",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]
        triggers = [
            # Enforce only one root directory per workspace
            pgtrigger.Trigger(
                name="001_unique_root_directory",
                operation=pgtrigger.Insert | pgtrigger.Update,
                when=pgtrigger.Before,
                func=pgtrigger.Func(
                    """
                    -- Only check for Directory types (check polymorphic_ctype)
                    -- Get the content type ID for Directory model
                    DECLARE
                        directory_ctype_id INTEGER;
                        existing_root_count INTEGER;
                    BEGIN
                        -- Get Directory content type ID
                        SELECT id INTO directory_ctype_id
                        FROM django_content_type
                        WHERE app_label = 'files_manager' AND model = 'directory';
                        
                        -- Only enforce for Directory types with no parent (root)
                        IF NEW.polymorphic_ctype_id = directory_ctype_id 
                           AND NEW.parent_id IS NULL 
                           AND NEW.deleted_at IS NULL THEN
                            
                            -- Check if another root exists for this workspace
                            SELECT COUNT(*) INTO existing_root_count
                            FROM files_manager_filenode
                            WHERE workspace_id = NEW.workspace_id
                              AND parent_id IS NULL
                              AND deleted_at IS NULL
                              AND polymorphic_ctype_id = directory_ctype_id
                              AND id != NEW.id;
                            
                            IF existing_root_count > 0 THEN
                                RAISE EXCEPTION 'Only one root directory allowed per workspace';
                            END IF;
                        END IF;
                        
                        RETURN NEW;
                    END;
                    """
                ),
            ),
            # Enforce that non-Directory file types must have a parent
            pgtrigger.Trigger(
                name="002_files_require_parent",
                operation=pgtrigger.Insert | pgtrigger.Update,
                when=pgtrigger.Before,
                func=pgtrigger.Func(
                    """
                    DECLARE
                        directory_ctype_id INTEGER;
                    BEGIN
                        -- Get Directory content type ID
                        SELECT id INTO directory_ctype_id
                        FROM django_content_type
                        WHERE app_label = 'files_manager' AND model = 'directory';
                        
                        -- If not a Directory and parent is null, reject
                        IF NEW.polymorphic_ctype_id != directory_ctype_id 
                           AND NEW.parent_id IS NULL 
                           AND NEW.deleted_at IS NULL THEN
                            RAISE EXCEPTION 'Files must have a parent directory';
                        END IF;
                        
                        RETURN NEW;
                    END;
                    """
                ),
            ),
        ]

    def __str__(self):
        return f"📄 {self.name}"

    @property
    def path(self):
        """Compute full path by walking up the tree."""
        parts = [self.name]
        current = self.parent
        while current:
            parts.insert(0, current.name)
            current = current.parent
        return "/".join(parts)

    @property
    def is_directory(self):
        """Check if this node is a directory."""
        return isinstance(self, Directory)


class Directory(FileNode):
    """
    A folder/directory in the file system.
    Can contain other directories or files.
    Only one root directory (parent=None) per workspace.
    """

    # Optional metadata for directories
    description = models.TextField(
        blank=True,
        help_text="Optional description of the folder",
    )
    color = models.CharField(
        max_length=7,
        blank=True,
        help_text="Hex color for folder icon (e.g., #FF5733)",
    )
    icon = models.CharField(
        max_length=50,
        blank=True,
        help_text="Icon identifier for the folder",
    )

    class Meta:
        verbose_name = "Directory"
        verbose_name_plural = "Directories"

    def __str__(self):
        return f"📁 {self.name}"

    def clean(self):
        super().clean()
        # Prevent circular references
        if self.parent:
            current = self.parent
            while current:
                if current.pk == self.pk:
                    raise ValidationError("A directory cannot be its own ancestor.")
                current = current.parent

    @classmethod
    def get_or_create_root(cls, workspace):
        """Get or create the root directory for a workspace."""
        root, created = cls.objects.get_or_create(
            workspace=workspace,
            parent=None,
            defaults={"name": "Root"},
        )
        return root

    @classmethod
    def get_or_create_path(cls, workspace, path):
        """
        Create directory structure from a path string.
        Returns the deepest directory.
        """
        root = cls.get_or_create_root(workspace)

        parts = [p for p in path.split("/") if p]
        if not parts:
            return root

        current_parent = root
        for part in parts:
            directory, _ = cls.objects.get_or_create(
                workspace=workspace,
                parent=current_parent,
                name=part,
            )
            current_parent = directory

        return current_parent


class File(FileNode):
    """
    Base model for actual files (not directories).
    Must have a Directory parent.
    """

    file = models.FileField(
        upload_to=file_upload_path,
        help_text="The actual file",
    )
    size = models.BigIntegerField(
        null=True,
        blank=True,
        help_text="File size in bytes",
    )
    mime_type = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="MIME type of the file",
    )

    class Meta:
        abstract = True

    def clean(self):
        super().clean()
        if not self.parent:
            raise ValidationError("Files must have a parent directory.")

    def save(self, *args, **kwargs):
        if not self.parent:
            raise ValidationError("Files must have a parent directory.")
        super().save(*args, **kwargs)


class ImageFile(File):
    """File for images with image-specific metadata."""

    width = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Image width in pixels",
    )
    height = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Image height in pixels",
    )
    thumbnail_url = models.URLField(
        max_length=500,
        null=True,
        blank=True,
        help_text="URL to thumbnail image",
    )
    exif_data = models.JSONField(
        null=True,
        blank=True,
        help_text="Extracted EXIF metadata",
    )
    alt_text = models.CharField(
        max_length=500,
        blank=True,
        help_text="Alternative text for accessibility",
    )

    class Meta:
        verbose_name = "Image"
        verbose_name_plural = "Images"


class DocumentFile(File):
    """File for documents (PDF, Word, Excel, etc.)."""

    page_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of pages (for PDFs, docs)",
    )
    text_content = models.TextField(
        blank=True,
        help_text="Extracted text content for search",
    )
    author = models.CharField(
        max_length=255,
        blank=True,
        help_text="Document author",
    )
    title = models.CharField(
        max_length=500,
        blank=True,
        help_text="Document title from metadata",
    )

    class Meta:
        verbose_name = "Document"
        verbose_name_plural = "Documents"


class VideoFile(File):
    """File for video files."""

    duration = models.DurationField(
        null=True,
        blank=True,
        help_text="Video duration",
    )
    width = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Video width in pixels",
    )
    height = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Video height in pixels",
    )
    thumbnail_url = models.URLField(
        max_length=500,
        null=True,
        blank=True,
        help_text="URL to video thumbnail",
    )
    codec = models.CharField(
        max_length=50,
        blank=True,
        help_text="Video codec (e.g., h264, vp9)",
    )
    frame_rate = models.FloatField(
        null=True,
        blank=True,
        help_text="Frames per second",
    )

    class Meta:
        verbose_name = "Video"
        verbose_name_plural = "Videos"


class AudioFile(File):
    """File for audio files."""

    duration = models.DurationField(
        null=True,
        blank=True,
        help_text="Audio duration",
    )
    artist = models.CharField(
        max_length=255,
        blank=True,
        help_text="Artist/performer",
    )
    album = models.CharField(
        max_length=255,
        blank=True,
        help_text="Album name",
    )
    track_number = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Track number",
    )
    codec = models.CharField(
        max_length=50,
        blank=True,
        help_text="Audio codec (e.g., mp3, aac, flac)",
    )
    bitrate = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Bitrate in kbps",
    )
    sample_rate = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Sample rate in Hz",
    )

    class Meta:
        verbose_name = "Audio"
        verbose_name_plural = "Audio Files"
