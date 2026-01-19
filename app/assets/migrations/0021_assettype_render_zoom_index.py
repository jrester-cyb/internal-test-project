# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assets', '0020_add_render_zoom_to_asset_type'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='assettype',
            index=models.Index(
                fields=['min_render_zoom', 'max_render_zoom'],
                name='idx_assettype_render_zoom',
            ),
        ),
    ]
