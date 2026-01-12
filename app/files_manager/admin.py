from django.contrib import admin
from polymorphic.admin import PolymorphicParentModelAdmin, PolymorphicChildModelAdmin
from .models import (
    FileNode,
    Directory,
    ImageFile,
    DocumentFile,
    VideoFile,
    AudioFile,
)


class FileNodeChildAdmin(PolymorphicChildModelAdmin):
    """Base admin class for all file node types."""

    base_model = FileNode
    show_in_index = True


@admin.register(Directory)
class DirectoryAdmin(FileNodeChildAdmin):
    base_model = Directory
    list_display = ["name", "workspace", "parent", "description", "created_at"]
    list_filter = ["workspace", "created_at"]
    search_fields = ["name", "description"]
    raw_id_fields = ["parent", "workspace"]


@admin.register(ImageFile)
class ImageFileAdmin(FileNodeChildAdmin):
    base_model = ImageFile
    list_display = [
        "name",
        "workspace",
        "parent",
        "width",
        "height",
        "size",
        "created_at",
    ]
    list_filter = ["workspace", "created_at", "mime_type"]
    search_fields = ["name", "alt_text"]
    raw_id_fields = ["parent", "workspace"]


@admin.register(DocumentFile)
class DocumentFileAdmin(FileNodeChildAdmin):
    base_model = DocumentFile
    list_display = [
        "name",
        "workspace",
        "parent",
        "page_count",
        "author",
        "size",
        "created_at",
    ]
    list_filter = ["workspace", "created_at", "mime_type"]
    search_fields = ["name", "title", "author", "text_content"]
    raw_id_fields = ["parent", "workspace"]


@admin.register(VideoFile)
class VideoFileAdmin(FileNodeChildAdmin):
    base_model = VideoFile
    list_display = [
        "name",
        "workspace",
        "parent",
        "duration",
        "width",
        "height",
        "size",
        "created_at",
    ]
    list_filter = ["workspace", "created_at", "mime_type", "codec"]
    search_fields = ["name"]
    raw_id_fields = ["parent", "workspace"]


@admin.register(AudioFile)
class AudioFileAdmin(FileNodeChildAdmin):
    base_model = AudioFile
    list_display = [
        "name",
        "workspace",
        "parent",
        "duration",
        "artist",
        "album",
        "size",
        "created_at",
    ]
    list_filter = ["workspace", "created_at", "mime_type", "codec"]
    search_fields = ["name", "artist", "album"]
    raw_id_fields = ["parent", "workspace"]


@admin.register(FileNode)
class FileNodeAdmin(PolymorphicParentModelAdmin):
    base_model = FileNode
    child_models = (Directory, ImageFile, DocumentFile, VideoFile, AudioFile)
    list_display = ["name", "workspace", "parent", "created_at"]
    list_filter = ["workspace", "created_at"]
    search_fields = ["name"]
    raw_id_fields = ["parent", "workspace"]
