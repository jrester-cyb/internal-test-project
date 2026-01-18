import mimetypes
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.pagination import PageNumberPagination, LimitOffsetPagination
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter

from .models import (
    FileNode,
    Directory,
    File,
    ImageFile,
    DocumentFile,
    VideoFile,
    AudioFile,
)
from .serializers import (
    FileNodePolymorphicSerializer,
    FileNodeTreeSerializer,
    DirectorySerializer,
    FileBaseSerializer,
    ImageFileSerializer,
    DocumentFileSerializer,
    VideoFileSerializer,
    AudioFileSerializer,
    FileUploadSerializer,
    BulkMoveSerializer,
)


# MIME type to model mapping
MIME_TYPE_MODEL_MAP = {
    # Images
    "image/jpeg": ImageFile,
    "image/png": ImageFile,
    "image/gif": ImageFile,
    "image/webp": ImageFile,
    "image/svg+xml": ImageFile,
    "image/bmp": ImageFile,
    "image/tiff": ImageFile,
    # Documents
    "application/pdf": DocumentFile,
    "application/msword": DocumentFile,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": DocumentFile,
    "application/vnd.ms-excel": DocumentFile,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": DocumentFile,
    "application/vnd.ms-powerpoint": DocumentFile,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": DocumentFile,
    "text/plain": DocumentFile,
    "text/csv": DocumentFile,
    "application/json": DocumentFile,
    # Videos
    "video/mp4": VideoFile,
    "video/webm": VideoFile,
    "video/ogg": VideoFile,
    "video/quicktime": VideoFile,
    "video/x-msvideo": VideoFile,
    # Audio
    "audio/mpeg": AudioFile,
    "audio/wav": AudioFile,
    "audio/ogg": AudioFile,
    "audio/flac": AudioFile,
    "audio/aac": AudioFile,
    "audio/webm": AudioFile,
}


def get_file_model_for_mime_type(mime_type):
    """Determine which model to use based on MIME type."""
    if mime_type in MIME_TYPE_MODEL_MAP:
        return MIME_TYPE_MODEL_MAP[mime_type]

    # Fallback to category-based detection
    if mime_type and mime_type.startswith("image/"):
        return ImageFile
    elif mime_type and mime_type.startswith("video/"):
        return VideoFile
    elif mime_type and mime_type.startswith("audio/"):
        return AudioFile
    elif mime_type and mime_type.startswith("text/"):
        return DocumentFile

    # Default to base File
    return File


class FileNodePagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 1000


class FileNodeTreePagination(LimitOffsetPagination):
    """Pagination for tree endpoints using limit/offset."""

    default_limit = 100
    max_limit = 1000


@extend_schema_view(
    list=extend_schema(tags=["Files"]),
    create=extend_schema(tags=["Files"]),
    retrieve=extend_schema(tags=["Files"]),
    update=extend_schema(tags=["Files"]),
    partial_update=extend_schema(tags=["Files"]),
    destroy=extend_schema(tags=["Files"]),
)
class FileNodeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for file/folder management.

    Hierarchy rules:
    - Each workspace has exactly one root Directory (parent=null)
    - Directories can contain other Directories or Files
    - Files must always have a Directory parent

    Supports:
    - Listing folder contents
    - Creating folders and uploading files
    - Moving files/folders
    - Tree view of entire structure
    """

    serializer_class = FileNodePolymorphicSerializer
    pagination_class = FileNodePagination
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["parent"]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        """Filter by workspace or organization from URL kwargs."""
        workspace_pk = self.kwargs.get("workspace_pk")
        organization_pk = self.kwargs.get("organization_pk")

        if workspace_pk:
            return FileNode.objects.filter(workspace_id=workspace_pk)
        elif organization_pk:
            # Organization-level: return files from all workspaces in the org
            return FileNode.objects.filter(workspace__organization_id=organization_pk)
        return FileNode.objects.none()

    def get_serializer_class(self):
        """Use appropriate serializer based on action."""
        if self.action == "create_directory":
            return DirectorySerializer
        if self.action == "upload":
            return FileUploadSerializer
        if self.action == "tree":
            return FileNodeTreeSerializer
        if self.action == "move":
            return BulkMoveSerializer
        return FileNodePolymorphicSerializer

    @extend_schema(
        tags=["Files"],
        parameters=[
            OpenApiParameter(
                name="parent",
                description="Filter by parent directory ID. Use 'root' or omit for root directory contents.",
                required=False,
                type=str,
            ),
        ],
    )
    def list(self, request, *args, **kwargs):
        """
        List contents of a directory.

        - Pass parent=<id> for specific directory contents
        - Pass parent=root or omit to get root directory contents
        """
        workspace_pk = self.kwargs.get("workspace_pk")
        queryset = self.get_queryset()

        parent_param = request.query_params.get("parent")

        if parent_param == "root" or not parent_param:
            # Get or create root directory, then list its children
            from workspaces.models import Workspace

            workspace = Workspace.objects.get(pk=workspace_pk)
            root = Directory.get_or_create_root(workspace)
            queryset = queryset.filter(parent=root)
        elif parent_param:
            queryset = queryset.filter(parent_id=parent_param)

        queryset = self.filter_queryset(queryset)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @extend_schema(tags=["Files"])
    @action(detail=False, methods=["get"], url_path="root")
    def root(self, request, *args, **kwargs):
        """Get the root directory for this workspace."""
        workspace_pk = self.kwargs.get("workspace_pk")
        from workspaces.models import Workspace

        workspace = Workspace.objects.get(pk=workspace_pk)
        root = Directory.get_or_create_root(workspace)
        serializer = DirectorySerializer(root)
        return Response(serializer.data)

    @extend_schema(tags=["Files"])
    @action(detail=False, methods=["post"], url_path="directory")
    def create_directory(self, request, *args, **kwargs):
        """
        Create a new directory.

        Parent is required unless this is the first directory in the workspace
        (which will be the root).
        """
        workspace_pk = self.kwargs.get("workspace_pk")
        from workspaces.models import Workspace

        workspace = Workspace.objects.get(pk=workspace_pk)

        # Check if parent is provided
        parent_id = request.data.get("parent")

        if not parent_id:
            # Check if root already exists
            existing_root = Directory.objects.filter(
                workspace=workspace,
                parent__isnull=True,
                deleted_at__isnull=True,
            ).first()

            if existing_root:
                return Response(
                    {
                        "error": "Root directory already exists. New directories must have a parent."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = DirectorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=workspace)

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(tags=["Files"])
    @action(
        detail=False,
        methods=["post"],
        url_path="upload",
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload(self, request, *args, **kwargs):
        """
        Upload a file. Automatically determines file type from MIME type
        and creates the appropriate polymorphic model.

        Parent directory is required.
        """
        workspace_pk = self.kwargs.get("workspace_pk")
        from workspaces.models import Workspace

        workspace = Workspace.objects.get(pk=workspace_pk)

        serializer = FileUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data["file"]
        parent_id = serializer.validated_data["parent"]
        name = serializer.validated_data.get("name", uploaded_file.name)

        # Validate parent exists and is a directory in this workspace
        try:
            parent = Directory.objects.get(pk=parent_id, workspace=workspace)
        except Directory.DoesNotExist:
            return Response(
                {"error": "Parent directory not found in this workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Determine MIME type
        mime_type, _ = mimetypes.guess_type(name)
        if not mime_type and hasattr(uploaded_file, "content_type"):
            mime_type = uploaded_file.content_type

        # Get appropriate model class
        model_class = get_file_model_for_mime_type(mime_type)

        # Create the file record
        file_node = model_class.objects.create(
            workspace=workspace,
            name=name,
            parent=parent,
            file=uploaded_file,
            size=uploaded_file.size,
            mime_type=mime_type,
        )

        # Return with polymorphic serializer
        response_serializer = FileNodePolymorphicSerializer(file_node)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def _get_tree_response(self, request, directory_id=None):
        """
        Internal method to get a directory and its paginated children.
        Supports search filtering via ?search= query param.
        Works for both workspace-level and organization-level routes.
        """
        workspace_pk = self.kwargs.get("workspace_pk")
        organization_pk = self.kwargs.get("organization_pk")
        search_query = request.query_params.get("search", "").strip()

        from django.db.models import Case, When, Value, IntegerField
        from django.contrib.contenttypes.models import ContentType

        directory_ct = ContentType.objects.get_for_model(Directory)

        if directory_id:
            # Get specific directory by ID - works for both workspace and org level
            queryset = self.get_queryset()
            try:
                current_dir = Directory.objects.get(
                    pk=directory_id,
                    deleted_at__isnull=True,
                )
                # Verify it's accessible from the current context
                if workspace_pk and str(current_dir.workspace_id) != str(workspace_pk):
                    raise Directory.DoesNotExist()
                if organization_pk and str(current_dir.workspace.organization_id) != str(organization_pk):
                    raise Directory.DoesNotExist()
            except Directory.DoesNotExist:
                return Response(
                    {"error": "Directory not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            children = (
                FileNode.objects.filter(parent=current_dir)
                .annotate(
                    dir_order=Case(
                        When(polymorphic_ctype=directory_ct, then=Value(0)),
                        default=Value(1),
                        output_field=IntegerField(),
                    )
                )
                .order_by("dir_order", "name")
            )

            # Apply search filter if provided
            if search_query:
                children = children.filter(name__icontains=search_query)

            # Paginate children
            paginator = FileNodeTreePagination()
            page = paginator.paginate_queryset(children, request)

            if page is not None:
                children_data = FileNodeTreeSerializer(
                    page, many=True, context={"request": request}
                ).data
                children_response = paginator.get_paginated_response(children_data).data
            else:
                children_data = FileNodeTreeSerializer(
                    children, many=True, context={"request": request}
                ).data
                children_response = {
                    "count": len(children_data),
                    "next": None,
                    "previous": None,
                    "results": children_data,
                }

            # Build response with directory info and paginated children
            dir_data = DirectorySerializer(current_dir).data
            dir_data["children"] = children_response

            return Response(dir_data)

        elif workspace_pk:
            # Workspace-level root
            from workspaces.models import Workspace
            workspace = Workspace.objects.get(pk=workspace_pk)
            current_dir = Directory.get_or_create_root(workspace)

            children = (
                FileNode.objects.filter(parent=current_dir)
                .annotate(
                    dir_order=Case(
                        When(polymorphic_ctype=directory_ct, then=Value(0)),
                        default=Value(1),
                        output_field=IntegerField(),
                    )
                )
                .order_by("dir_order", "name")
            )

            if search_query:
                children = children.filter(name__icontains=search_query)

            paginator = FileNodeTreePagination()
            page = paginator.paginate_queryset(children, request)

            if page is not None:
                children_data = FileNodeTreeSerializer(
                    page, many=True, context={"request": request}
                ).data
                children_response = paginator.get_paginated_response(children_data).data
            else:
                children_data = FileNodeTreeSerializer(
                    children, many=True, context={"request": request}
                ).data
                children_response = {
                    "count": len(children_data),
                    "next": None,
                    "previous": None,
                    "results": children_data,
                }

            dir_data = DirectorySerializer(current_dir).data
            dir_data["children"] = children_response

            return Response(dir_data)

        elif organization_pk:
            # Organization-level: show all workspace root directories as children
            from workspaces.models import Workspace
            from organizations.models import Organization

            try:
                organization = Organization.objects.get(pk=organization_pk)
            except Organization.DoesNotExist:
                return Response(
                    {"error": "Organization not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            # Get all workspaces in this organization
            workspaces = Workspace.objects.filter(
                organization=organization,
                deleted_at__isnull=True,
            ).order_by("name")

            # Get or create root directories for each workspace
            root_directories = []
            for ws in workspaces:
                root = Directory.get_or_create_root(ws)
                root_directories.append(root)

            # Apply search filter if provided
            if search_query:
                root_directories = [
                    d for d in root_directories
                    if search_query.lower() in d.workspace.name.lower()
                ]

            # Paginate the root directories
            paginator = FileNodeTreePagination()
            page = paginator.paginate_queryset(root_directories, request)

            if page is not None:
                # Serialize with workspace name as the display name
                children_data = []
                for root_dir in page:
                    dir_data = FileNodeTreeSerializer(root_dir, context={"request": request}).data
                    # Override name to show workspace name instead of "Root"
                    dir_data["name"] = root_dir.workspace.name
                    children_data.append(dir_data)
                children_response = paginator.get_paginated_response(children_data).data
            else:
                children_data = []
                for root_dir in root_directories:
                    dir_data = FileNodeTreeSerializer(root_dir, context={"request": request}).data
                    # Override name to show workspace name instead of "Root"
                    dir_data["name"] = root_dir.workspace.name
                    children_data.append(dir_data)
                children_response = {
                    "count": len(children_data),
                    "next": None,
                    "previous": None,
                    "results": children_data,
                }

            # Return a virtual root representing the organization
            return Response({
                "id": str(organization_pk),
                "name": organization.name,
                "isDirectory": True,
                "isOrganizationRoot": True,
                "ancestors": [],
                "children": children_response,
            })

        return Response(
            {"error": "Workspace or organization context required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @extend_schema(
        tags=["Files"],
        parameters=[
            OpenApiParameter(
                name="search",
                description="Search files and folders by name",
                required=False,
                type=str,
            ),
            OpenApiParameter(
                name="limit",
                description="Number of children to return (default 100, max 1000)",
                required=False,
                type=int,
            ),
            OpenApiParameter(
                name="offset",
                description="Number of children to skip for pagination",
                required=False,
                type=int,
            ),
        ],
    )
    @action(detail=False, methods=["get"], url_path="tree")
    def tree(self, request, *args, **kwargs):
        """
        Get root directory and its paginated children for lazy-loaded tree.

        Returns the root directory with paginated children.
        Each child has has_children flag for lazy loading.
        """
        return self._get_tree_response(request)

    @extend_schema(
        tags=["Files"],
        parameters=[
            OpenApiParameter(
                name="search",
                description="Search files and folders by name",
                required=False,
                type=str,
            ),
            OpenApiParameter(
                name="limit",
                description="Number of children to return (default 100, max 1000)",
                required=False,
                type=int,
            ),
            OpenApiParameter(
                name="offset",
                description="Number of children to skip for pagination",
                required=False,
                type=int,
            ),
        ],
    )
    @action(detail=False, methods=["get"], url_path=r"tree/(?P<directory_id>[^/]+)")
    def tree_directory(self, request, directory_id, *args, **kwargs):
        """
        Get a directory by ID and its paginated children for lazy-loaded tree.

        Returns the directory with paginated children.
        Each child has has_children flag for lazy loading.
        """
        return self._get_tree_response(request, directory_id)

    @extend_schema(tags=["Files"])
    @action(detail=False, methods=["post"], url_path="move")
    def move(self, request, *args, **kwargs):
        """
        Move files/folders to a new parent directory.

        Note: Cannot move the root directory.
        """
        workspace_pk = self.kwargs.get("workspace_pk")

        serializer = BulkMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        file_ids = serializer.validated_data["file_ids"]
        destination_parent_id = serializer.validated_data["destination_parent"]

        queryset = self.get_queryset().filter(id__in=file_ids)

        # Validate destination exists and is a directory in this workspace
        try:
            dest = Directory.objects.get(
                pk=destination_parent_id, workspace_id=workspace_pk
            )
        except Directory.DoesNotExist:
            return Response(
                {"error": "Destination directory not found in this workspace."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check for root directory in the items to move
        for node in queryset:
            if isinstance(node, Directory) and node.parent is None:
                return Response(
                    {"error": "Cannot move the root directory."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Prevent moving a folder into itself or its descendants
        for node in queryset:
            if isinstance(node, Directory):
                current = dest
                while current:
                    if current.pk == node.pk:
                        return Response(
                            {
                                "error": f"Cannot move directory '{node.name}' into itself or its descendants."
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    current = current.parent

        # Perform the move
        updated = queryset.update(parent=dest)

        return Response(
            {
                "moved": updated,
                "destination": str(destination_parent_id),
            }
        )

    @extend_schema(tags=["Files"])
    @action(detail=True, methods=["post"], url_path="rename")
    def rename(self, request, *args, **kwargs):
        """Rename a file or directory."""
        instance = self.get_object()
        new_name = request.data.get("name")

        if not new_name:
            return Response(
                {"error": "Name is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Don't allow renaming root
        if isinstance(instance, Directory) and instance.parent is None:
            return Response(
                {"error": "Cannot rename the root directory."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance.name = new_name
        instance.save(update_fields=["name", "updated_at"])

        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @extend_schema(tags=["Files"])
    @action(detail=True, methods=["post"], url_path="copy")
    def copy(self, request, *args, **kwargs):
        """
        Copy a file to a new location.
        Only files can be copied, not directories.
        """
        instance = self.get_object()

        if isinstance(instance, Directory):
            return Response(
                {"error": "Directory copying is not supported."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        destination_parent_id = request.data.get("destination_parent")
        new_name = request.data.get("name", f"Copy of {instance.name}")

        if not destination_parent_id:
            return Response(
                {"error": "Destination parent directory is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate destination
        try:
            dest = Directory.objects.get(
                pk=destination_parent_id,
                workspace=instance.workspace,
            )
        except Directory.DoesNotExist:
            return Response(
                {"error": "Destination directory not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Create copy with same polymorphic type
        model_class = instance.__class__

        # Get all field values from the original
        copy_data = {
            "workspace": instance.workspace,
            "name": new_name,
            "parent": dest,
            "file": instance.file,  # Same file reference
            "size": instance.size,
            "mime_type": instance.mime_type,
        }

        # Copy type-specific fields
        if isinstance(instance, ImageFile):
            copy_data.update(
                {
                    "width": instance.width,
                    "height": instance.height,
                    "thumbnail_url": instance.thumbnail_url,
                    "exif_data": instance.exif_data,
                    "alt_text": instance.alt_text,
                }
            )
        elif isinstance(instance, DocumentFile):
            copy_data.update(
                {
                    "page_count": instance.page_count,
                    "text_content": instance.text_content,
                    "author": instance.author,
                    "title": instance.title,
                }
            )
        elif isinstance(instance, VideoFile):
            copy_data.update(
                {
                    "duration": instance.duration,
                    "width": instance.width,
                    "height": instance.height,
                    "thumbnail_url": instance.thumbnail_url,
                    "codec": instance.codec,
                    "frame_rate": instance.frame_rate,
                }
            )
        elif isinstance(instance, AudioFile):
            copy_data.update(
                {
                    "duration": instance.duration,
                    "artist": instance.artist,
                    "album": instance.album,
                    "track_number": instance.track_number,
                    "codec": instance.codec,
                    "bitrate": instance.bitrate,
                    "sample_rate": instance.sample_rate,
                }
            )

        new_file = model_class.objects.create(**copy_data)

        serializer = self.get_serializer(new_file)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        """
        Delete a file or directory.
        Cannot delete the root directory.
        """
        instance = self.get_object()

        if isinstance(instance, Directory) and instance.parent is None:
            return Response(
                {"error": "Cannot delete the root directory."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return super().destroy(request, *args, **kwargs)
