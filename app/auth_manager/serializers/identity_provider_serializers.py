# stdlib
import copy

# local
from auth_manager.models.identity_provider_models import IdentityProvider, LocalIdentityProvider, SAMLIdentityProvider
from rest_framework.reverse import reverse

# thirdparty
from rest_framework import serializers


# Base serializer for shared fields
class BaseIdentityProviderSerializer(serializers.ModelSerializer):
    domains = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    callback_url = serializers.SerializerMethodField(read_only=True)
    global_id = serializers.UUIDField(required=False)

    class Meta:
        model = IdentityProvider
        fields = (
            "global_id",
            "name",
            "description",
            "enabled",
            "domains",
            "type",
            "callback_url",
        )

    def validate(self, attrs):
        # Prevent disabling if no other enabled IdP exists
        enabled = attrs.get("enabled", getattr(self.instance, "enabled", True))
        if self.instance and not enabled:
            # Exclude self and check for any other enabled IdP
            others_enabled = IdentityProvider.objects.exclude(pk=self.instance.pk).filter(enabled=True).exists()
            if not others_enabled:
                raise serializers.ValidationError(
                    "You cannot disable this identity provider unless another identity provider is enabled."
                )
        return attrs

    def validate_domains(self, value):
        """
        Validate and normalize the list of domains. This will ensure:
        - Domains are lowercased and stripped of whitespace.
        - No duplicate domains in the list.
        - No overlapping domains with other Identity Providers.
        """

        # Normalize and check for duplicates
        normalized_domains = set()
        for domain in value:
            domain = domain.strip().lower()
            if domain in normalized_domains:
                raise serializers.ValidationError(f"Duplicate domain found: {domain}")
            normalized_domains.add(domain)

        # Check for overlapping domains with other IdPs
        overlapping_idps_qs = IdentityProvider.objects.filter(domains__overlap=list(normalized_domains))
        if self.instance:
            overlapping_idps_qs = overlapping_idps_qs.exclude(pk=self.instance.pk)
        if overlapping_idps_qs.exists():
            raise serializers.ValidationError("One or more domains are already in use by another identity provider.")

        # Return the normalized list of domains
        return list(normalized_domains)

    def get_callback_url(self, obj):
        request = self.context.get("request")
        if request:
            return reverse("auth-manager:auth-callback", args=(obj.global_id_str,), request=request)
        return None


class LocalIdentityProviderSerializer(BaseIdentityProviderSerializer):

    type = serializers.SerializerMethodField(read_only=True)

    def get_type(self, obj):
        return "local"

    class Meta(BaseIdentityProviderSerializer.Meta):
        model = LocalIdentityProvider

    def validate(self, attrs):
        # Prevent disabling if no other enabled IdP exists
        enabled = attrs.get("enabled", getattr(self.instance, "enabled", True))
        if self.instance and not enabled:
            # Exclude self and check for any other enabled IdP
            others_enabled = IdentityProvider.objects.exclude(pk=self.instance.pk).filter(enabled=True).exists()
            if not others_enabled:
                raise serializers.ValidationError(
                    "You cannot disable this identity provider unless another identity provider is enabled."
                )
        # Prevent creating more than one LocalIdentityProvider
        if not self.instance and LocalIdentityProvider.objects.exists():
            raise serializers.ValidationError("Only one LocalIdentityProvider instance is allowed.")
        return attrs


class SAMLIdentityProviderSerializer(BaseIdentityProviderSerializer):
    type = serializers.SerializerMethodField(read_only=True)

    def get_type(self, obj):
        return "saml"

    def get_fields(self):
        # Modify the list of fields to include the detailed_fields
        original_meta_fields = copy.deepcopy(self.Meta.fields)
        if self.context.get("detailed", False):
            self.Meta.fields = self.Meta.fields + self.Meta.detailed_fields
        found_fields = super().get_fields()
        self.Meta.fields = original_meta_fields  # Restore original fields
        return found_fields

    class Meta(BaseIdentityProviderSerializer.Meta):
        model = SAMLIdentityProvider
        detailed_fields = (
            "allow_autoenrollment",
            "entity_id",
            "sso_url",
            "x509_cert",
            "metadata_url",
            "attribute_mappings",
        )


class IdentityProviderSerializer(serializers.Serializer):
    """
    Polymorphic serializer for IdentityProvider and its subclasses.
    """

    def to_internal_value(self, data):
        partial = getattr(self, "partial", False)
        # For updates, use self.instance to determine type; for creates, use 'type' in data
        if self.instance is not None:
            if isinstance(self.instance, LocalIdentityProvider):
                serializer_class = LocalIdentityProviderSerializer
            elif isinstance(self.instance, SAMLIdentityProvider):
                serializer_class = SAMLIdentityProviderSerializer
            else:
                raise serializers.ValidationError("Cannot update base IdentityProvider; use a concrete subclass.")
            serializer = serializer_class(
                self.instance,
                data=data,
                partial=partial,
                context=self.context,
            )
        else:
            type_map = {
                "local": LocalIdentityProviderSerializer,
                "saml": SAMLIdentityProviderSerializer,
            }
            idp_type = data.get("type").lower()
            serializer_class = type_map.get(idp_type)
            if not serializer_class:
                raise serializers.ValidationError(
                    "'type' must be 'local' or 'saml'. Base IdentityProvider is not allowed."
                )
            serializer = serializer_class(
                data=data,
                partial=partial,
                context=self.context,
            )

        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    def to_representation(self, instance):
        if isinstance(instance, LocalIdentityProvider):
            return LocalIdentityProviderSerializer(instance, context=self.context).data
        elif isinstance(instance, SAMLIdentityProvider):
            return SAMLIdentityProviderSerializer(instance, context=self.context).data
        raise serializers.ValidationError("Cannot serialize base IdentityProvider; use a concrete subclass.")

    def create(self, validated_data):
        idp_type = self.initial_data.get("type").lower()
        if idp_type == "local":
            return LocalIdentityProvider.objects.create(**validated_data)
        elif idp_type == "saml":
            return SAMLIdentityProvider.objects.create(**validated_data)
        raise serializers.ValidationError("'type' must be 'local' or 'saml'. Base IdentityProvider is not allowed.")

    def update(self, instance, validated_data):
        # Use the correct serializer for the instance type
        # Pass the original input data, not just validated_data, to preserve partial update semantics
        partial = getattr(self, "partial", True)
        if isinstance(instance, LocalIdentityProvider):
            serializer = LocalIdentityProviderSerializer(
                instance, data=validated_data, partial=partial, context=self.context
            )
        elif isinstance(instance, SAMLIdentityProvider):
            serializer = SAMLIdentityProviderSerializer(
                instance, data=validated_data, partial=partial, context=self.context
            )
        else:
            raise serializers.ValidationError("Cannot update base IdentityProvider; use a concrete subclass.")
        serializer.is_valid(raise_exception=True)
        return serializer.save()
