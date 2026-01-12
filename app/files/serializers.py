from rest_framework import serializers
from .models import (
    FileNode,
    Directory,
    File,
    ImageFile,
    DocumentFile,
    VideoFile,
    AudioFile,
)


class FileNodeBaseSerializer(serializers.ModelSerializer):
    """Base serializer with common fields for all file node types."""

    path = serializers.CharField(read_only=True)
    is_directory = serializers.BooleanField(read_only=True)

    class Meta:
        model = FileNode
        fields = [
            "id",
            "name",
            "parent",
            "is_directory",
            "workspace",
            "path",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "path", "is_directory", "created_at", "updated_at"]


class DirectorySerializer(serializers.ModelSerializer):
    """Serializer for directories."""

    path = serializers.CharField(read_only=True)
    is_directory = serializers.BooleanField(read_only=True, default=True)
    children_count = serializers.SerializerMethodField()
    has_children = serializers.SerializerMethodField()

    class Meta:
        model = Directory
        fields = [
            "id",
            "name",
            "parent",
            "is_directory",
            "workspace",
            "description",
            "color",
            "icon",
            "path",
            "children_count",
            "has_children",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "path", "is_directory", "created_at", "updated_at"]

    def get_children_count(self, obj):
        """Return count of direct children."""
        return obj.children.count()

    def get_has_children(self, obj):
        """Return whether this directory has children (for lazy loading)."""
        return obj.children.exists()


class FileBaseSerializer(serializers.ModelSerializer):
    """Base serializer for file types (not directories)."""

    path = serializers.CharField(read_only=True)
    is_directory = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = File
        fields = [
            "id",
            "name",
            "parent",
            "is_directory",
            "workspace",
            "file",
            "size",
            "mime_type",
            "path",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "path", "is_directory", "created_at", "updated_at"]

    def validate_parent(self, value):
        """Ensure parent is provided for files."""
        if not value:
            raise serializers.ValidationError("Files must have a parent directory.")
        return value


class ImageFileSerializer(FileBaseSerializer):
    """Serializer for image files."""

    class Meta(FileBaseSerializer.Meta):
        model = ImageFile
        fields = FileBaseSerializer.Meta.fields + [
            "width",
            "height",
            "thumbnail_url",
            "exif_data",
            "alt_text",
        ]


class DocumentFileSerializer(FileBaseSerializer):
    """Serializer for document files."""

    class Meta(FileBaseSerializer.Meta):
        model = DocumentFile
        fields = FileBaseSerializer.Meta.fields + [
            "page_count",
            "text_content",
            "author",
            "title",
        ]


class VideoFileSerializer(FileBaseSerializer):
    """Serializer for video files."""

    class Meta(FileBaseSerializer.Meta):
        model = VideoFile
        fields = FileBaseSerializer.Meta.fields + [
            "duration",
            "width",
            "height",
            "thumbnail_url",
            "codec",
            "frame_rate",
        ]


class AudioFileSerializer(FileBaseSerializer):
    """Serializer for audio files."""

    class Meta(FileBaseSerializer.Meta):
        model = AudioFile
        fields = FileBaseSerializer.Meta.fields + [
            "duration",
            "artist",
            "album",
            "track_number",
            "codec",
            "bitrate",
            "sample_rate",
        ]


class FileNodePolymorphicSerializer(serializers.ModelSerializer):
    """
    Polymorphic serializer that automatically selects the right
    serializer based on file type.
    """

    class Meta:
        model = FileNode
        fields = "__all__"

    def to_representation(self, instance):
        """Select appropriate serializer based on instance type."""
        if isinstance(instance, Directory):
            serializer = DirectorySerializer(instance, context=self.context)
        elif isinstance(instance, ImageFile):
            serializer = ImageFileSerializer(instance, context=self.context)
        elif isinstance(instance, DocumentFile):
            serializer = DocumentFileSerializer(instance, context=self.context)
        elif isinstance(instance, VideoFile):
            serializer = VideoFileSerializer(instance, context=self.context)
        elif isinstance(instance, AudioFile):
            serializer = AudioFileSerializer(instance, context=self.context)
        elif isinstance(instance, File):
            serializer = FileBaseSerializer(instance, context=self.context)
        else:
            serializer = FileNodeBaseSerializer(instance, context=self.context)

        data = serializer.data

        # Add resource_type
        type_mapping = {
            "Directory": "directory",
            "File": "file",
            "ImageFile": "image",
            "DocumentFile": "document",
            "VideoFile": "video",
            "AudioFile": "audio",
        }
        data["resource_type"] = type_mapping.get(instance.__class__.__name__, "file")

        return data


class FileNodeTreeSerializer(serializers.ModelSerializer):
    """
    Serializer for lazy-loaded file tree structure.
    Returns node info with has_children flag for directories.
    Directories include a link to fetch their children.
    """

    resource_type = serializers.SerializerMethodField()
    is_directory = serializers.BooleanField(read_only=True)
    has_children = serializers.SerializerMethodField()
    children_url = serializers.SerializerMethodField()

    class Meta:
        model = FileNode
        fields = [
            "id",
            "name",
            "is_directory",
            "resource_type",
            "has_children",
            "children_url",
            "created_at",
            "updated_at",
        ]

    def get_has_children(self, obj):
        """Return whether this directory has children (for lazy loading)."""
        if not obj.is_directory:
            return False
        return obj.children.exists()

    def get_children_url(self, obj):
        """Return URL to fetch children for directories."""
        if not obj.is_directory:
            return None
        request = self.context.get("request")
        if request:
            # Build the tree URL for this directory
            workspace_pk = obj.workspace_id
            return request.build_absolute_uri(
                f"/api/workspaces/{workspace_pk}/files/tree/{obj.id}/"
            )
        return None

    def get_resource_type(self, obj):
        type_mapping = {
            "Directory": "directory",
            "File": "file",
            "ImageFile": "image",
            "DocumentFile": "document",
            "VideoFile": "video",
            "AudioFile": "audio",
        }
        return type_mapping.get(obj.__class__.__name__, "file")


class FileUploadSerializer(serializers.Serializer):
    """Serializer for file upload endpoint."""

    file = serializers.FileField()
    parent = serializers.UUIDField(
        required=True, help_text="Parent directory ID (required)"
    )
    name = serializers.CharField(required=False, max_length=255)

    def validate(self, data):
        if "name" not in data and "file" in data:
            data["name"] = data["file"].name
        return data


class BulkMoveSerializer(serializers.Serializer):
    """Serializer for bulk move operations."""

    file_ids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
    )
    destination_parent = serializers.UUIDField(
        required=True,
        help_text="Destination directory ID",
    )

    def validate_destination_parent(self, value):
        """Ensure destination is a directory."""
        try:
            dest = Directory.objects.get(pk=value)
        except Directory.DoesNotExist:
            raise serializers.ValidationError("Destination must be a valid directory.")
        return value
