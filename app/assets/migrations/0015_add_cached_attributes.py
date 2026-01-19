# Generated migration for cached_attributes fields and triggers
from django.db import migrations, models


# SQL to get content type IDs - these need to be looked up at runtime
GET_CHOICE_VALUE_FUNCTION = """
CREATE OR REPLACE FUNCTION get_choice_value(p_choice_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_ctype_id INT;
    v_result JSONB;
BEGIN
    -- Get the polymorphic content type of the choice
    SELECT polymorphic_ctype_id INTO v_ctype_id
    FROM assets_assettypeattributechoice
    WHERE id = p_choice_id;

    -- Extract value based on choice type
    SELECT
        CASE v_ctype_id
            WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='textattributechoice')
                THEN (SELECT to_jsonb(value) FROM assets_textattributechoice WHERE assettypeattributechoice_ptr_id = p_choice_id)
            WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='numberattributechoice')
                THEN (SELECT to_jsonb(value) FROM assets_numberattributechoice WHERE assettypeattributechoice_ptr_id = p_choice_id)
            WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='dateattributechoice')
                THEN (SELECT to_jsonb(value) FROM assets_dateattributechoice WHERE assettypeattributechoice_ptr_id = p_choice_id)
            WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='datetimeattributechoice')
                THEN (SELECT to_jsonb(value) FROM assets_datetimeattributechoice WHERE assettypeattributechoice_ptr_id = p_choice_id)
            WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='jsonattributechoice')
                THEN (SELECT value FROM assets_jsonattributechoice WHERE assettypeattributechoice_ptr_id = p_choice_id)
            WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='linkattributechoice')
                THEN (SELECT jsonb_build_object('url', url, 'text', COALESCE(NULLIF(display_text, ''), url))
                      FROM assets_linkattributechoice WHERE assettypeattributechoice_ptr_id = p_choice_id)
            ELSE NULL
        END INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;
"""

REBUILD_ASSET_CACHED_ATTRIBUTES_FUNCTION = """
CREATE OR REPLACE FUNCTION rebuild_asset_cached_attributes(p_asset_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE assets_asset
    SET cached_attributes = (
        SELECT COALESCE(jsonb_object_agg(api_key, typed_value), '{}'::jsonb)
        FROM (
            SELECT
                COALESCE(gata.api_key, wla.api_key) as api_key,
                CASE bav.polymorphic_ctype_id
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='textattributevalue')
                        THEN (SELECT to_jsonb(value) FROM assets_textattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='numberattributevalue')
                        THEN (SELECT to_jsonb(value) FROM assets_numberattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='booleanattributevalue')
                        THEN (SELECT to_jsonb(value) FROM assets_booleanattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='dateattributevalue')
                        THEN (SELECT to_jsonb(value) FROM assets_dateattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='datetimeattributevalue')
                        THEN (SELECT to_jsonb(value) FROM assets_datetimeattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='jsonattributevalue')
                        THEN (SELECT value FROM assets_jsonattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='linkattributevalue')
                        THEN (SELECT jsonb_build_object('url', url, 'text', COALESCE(NULLIF(display_text, ''), url))
                              FROM assets_linkattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='choiceattributevalue')
                        THEN (SELECT get_choice_value(cv.choice_id)
                              FROM assets_choiceattributevalue cv WHERE cv.baseattributevalue_ptr_id = bav.id)
                    ELSE NULL
                END as typed_value
            FROM assets_baseattributevalue bav
            LEFT JOIN assets_globalassettypeattribute gata
                ON gata.baseassettypeattribute_ptr_id = bav.asset_type_attribute_id
            LEFT JOIN assets_workspacelocalassettypeattribute wla
                ON wla.baseassettypeattribute_ptr_id = bav.asset_type_attribute_id
            WHERE bav.asset_id = p_asset_id
              AND bav.deleted_at IS NULL
              -- Exclude values that are workspace overrides (they go in WorkspaceAsset.cached_attribute_overrides)
              AND NOT EXISTS (
                  SELECT 1 FROM assets_workspaceattributevalueoverride wavo
                  WHERE wavo.override_value_id = bav.id
                  AND wavo.deleted_at IS NULL
              )
        ) sub
        WHERE api_key IS NOT NULL AND typed_value IS NOT NULL
    )
    WHERE id = p_asset_id;
END;
$$ LANGUAGE plpgsql;
"""

REBUILD_WORKSPACE_ASSET_CACHED_ATTRIBUTE_OVERRIDES_FUNCTION = """
CREATE OR REPLACE FUNCTION rebuild_workspace_asset_cached_attribute_overrides(p_workspace_id UUID, p_asset_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE assets_workspaceasset
    SET cached_attribute_overrides = (
        SELECT COALESCE(jsonb_object_agg(api_key, typed_value), '{}'::jsonb)
        FROM (
            SELECT
                COALESCE(gata.api_key, wla.api_key) as api_key,
                CASE bav.polymorphic_ctype_id
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='textattributevalue')
                        THEN (SELECT to_jsonb(value) FROM assets_textattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='numberattributevalue')
                        THEN (SELECT to_jsonb(value) FROM assets_numberattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='booleanattributevalue')
                        THEN (SELECT to_jsonb(value) FROM assets_booleanattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='dateattributevalue')
                        THEN (SELECT to_jsonb(value) FROM assets_dateattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='datetimeattributevalue')
                        THEN (SELECT to_jsonb(value) FROM assets_datetimeattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='jsonattributevalue')
                        THEN (SELECT value FROM assets_jsonattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='linkattributevalue')
                        THEN (SELECT jsonb_build_object('url', url, 'text', COALESCE(NULLIF(display_text, ''), url))
                              FROM assets_linkattributevalue WHERE baseattributevalue_ptr_id = bav.id)
                    WHEN (SELECT id FROM django_content_type WHERE app_label='assets' AND model='choiceattributevalue')
                        THEN (SELECT get_choice_value(cv.choice_id)
                              FROM assets_choiceattributevalue cv WHERE cv.baseattributevalue_ptr_id = bav.id)
                    ELSE NULL
                END as typed_value
            FROM assets_workspaceattributevalueoverride wavo
            JOIN assets_baseattributevalue bav ON bav.id = wavo.override_value_id
            LEFT JOIN assets_globalassettypeattribute gata
                ON gata.baseassettypeattribute_ptr_id = bav.asset_type_attribute_id
            LEFT JOIN assets_workspacelocalassettypeattribute wla
                ON wla.baseassettypeattribute_ptr_id = bav.asset_type_attribute_id
            WHERE wavo.workspace_id = p_workspace_id
              AND bav.asset_id = p_asset_id
              AND wavo.deleted_at IS NULL
              AND bav.deleted_at IS NULL
        ) sub
        WHERE api_key IS NOT NULL AND typed_value IS NOT NULL
    )
    WHERE workspace_id = p_workspace_id AND asset_id = p_asset_id;
END;
$$ LANGUAGE plpgsql;
"""

# Note: Triggers are now defined using pgtrigger in the models:
# - BaseAttributeValue.update_cached_attributes (attribute_value.py)
# - WorkspaceAttributeValueOverride.update_workspace_overrides (attribute_value.py)
# - *AttributeChoice.update_cached_on_choice_change (asset_type_attribute_choice.py)


def backfill_cached_attributes(apps, schema_editor):
    """Backfill cached_attributes for all existing assets and workspace assets."""
    from django.db import connection

    with connection.cursor() as cursor:
        # Backfill assets
        cursor.execute("""
            SELECT id FROM assets_asset WHERE deleted_at IS NULL
        """)
        asset_ids = cursor.fetchall()
        for (asset_id,) in asset_ids:
            cursor.execute("SELECT rebuild_asset_cached_attributes(%s)", [asset_id])

        # Backfill workspace assets
        cursor.execute("""
            SELECT workspace_id, asset_id FROM assets_workspaceasset
        """)
        workspace_assets = cursor.fetchall()
        for workspace_id, asset_id in workspace_assets:
            cursor.execute(
                "SELECT rebuild_workspace_asset_cached_attribute_overrides(%s, %s)",
                [workspace_id, asset_id],
            )


def reverse_backfill(apps, schema_editor):
    """Clear cached fields - not strictly necessary since we're dropping the columns."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("assets", "0014_alter_baseworkspaceextensionchoice_managers_and_more"),
    ]

    operations = [
        # Add the JSON fields
        migrations.AddField(
            model_name="asset",
            name="cached_attributes",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Denormalized JSON of global attribute values: {api_key: value}. Updated by database triggers.",
            ),
        ),
        migrations.AddField(
            model_name="workspaceasset",
            name="cached_attribute_overrides",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Denormalized JSON of workspace-specific attribute overrides: {api_key: value}. Updated by database triggers.",
            ),
        ),
        # Create helper function for getting choice values
        migrations.RunSQL(
            sql=GET_CHOICE_VALUE_FUNCTION,
            reverse_sql="DROP FUNCTION IF EXISTS get_choice_value(UUID);",
        ),
        # Create the rebuild functions
        migrations.RunSQL(
            sql=REBUILD_ASSET_CACHED_ATTRIBUTES_FUNCTION,
            reverse_sql="DROP FUNCTION IF EXISTS rebuild_asset_cached_attributes(UUID);",
        ),
        migrations.RunSQL(
            sql=REBUILD_WORKSPACE_ASSET_CACHED_ATTRIBUTE_OVERRIDES_FUNCTION,
            reverse_sql="DROP FUNCTION IF EXISTS rebuild_workspace_asset_cached_attribute_overrides(UUID, UUID);",
        ),
        # Note: Triggers are now managed by pgtrigger in the models:
        # - BaseAttributeValue.update_cached_attributes
        # - WorkspaceAttributeValueOverride.update_workspace_overrides
        # - *AttributeChoice.update_cached_on_choice_change
        # Backfill existing data
        migrations.RunPython(backfill_cached_attributes, reverse_backfill),
        # Add GIN indexes for efficient JSONB queries
        migrations.RunSQL(
            sql="CREATE INDEX idx_asset_cached_attrs_gin ON assets_asset USING GIN (cached_attributes jsonb_path_ops);",
            reverse_sql="DROP INDEX IF EXISTS idx_asset_cached_attrs_gin;",
        ),
        migrations.RunSQL(
            sql="CREATE INDEX idx_ws_asset_cached_overrides ON assets_workspaceasset USING GIN (cached_attribute_overrides jsonb_path_ops);",
            reverse_sql="DROP INDEX IF EXISTS idx_ws_asset_cached_overrides;",
        ),
    ]
