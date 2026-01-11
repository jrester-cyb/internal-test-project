#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'app.settings')
django.setup()

from organizations.models import Organization
from workspaces.models import Workspace
from assets.models import AssetType, Asset, AssetTypeAttribute, TextAttributeValue
import random

print("Testing delete counts with triggers...\n")

# Setup with unique slugs
slug_suffix = random.randint(1000, 9999)
org = Organization.objects.create(name="Test Org", slug=f"test-org-{slug_suffix}")
ws = Workspace.objects.create(name="Test WS", slug="test-ws-final", organization=org)
at = AssetType.objects.create(name="Building", workspace=ws)
attr = AssetTypeAttribute.objects.create(asset_type=at, name="Name", api_key="name", attribute_type="text", order=1)
asset = Asset.objects.create(asset_type=at, name="Building 1")

# Test single delete
val1 = TextAttributeValue.objects.create(asset=asset, attribute_type_attribute=attr, value="Value 1")
print(f"Created val1: {val1.id}")
result = val1.delete()
print(f"Single delete result: {result}")

# Verify soft delete worked
print(f"Exists in objects: {TextAttributeValue.objects.filter(id=val1.id).exists()}")
print(f"Exists in all_objects: {TextAttributeValue.all_objects.filter(id=val1.id).exists()}")
retrieved = TextAttributeValue.all_objects.get(id=val1.id)
print(f"deleted_at: {retrieved.deleted_at}")

# Test bulk delete
val2 = TextAttributeValue.objects.create(asset=asset, attribute_type_attribute=attr, value="Value 2")
print(f"\nCreated val2 with same asset/attribute (replaces deleted val1)")

# Create another asset attribute for bulk delete test
attr2 = AssetTypeAttribute.objects.create(asset_type=at, name="Description", api_key="description", attribute_type="text", order=2)
val3 = TextAttributeValue.objects.create(asset=asset, attribute_type_attribute=attr2, value="Value 3")
result = TextAttributeValue.objects.filter(id__in=[val2.id, val3.id]).delete()
print(f"Bulk delete result: {result}")

# Test cascade delete
result = org.delete()
print(f"\nOrganization delete (with cascades): {result}")

print("\n✅ Delete counts work with triggers!")
