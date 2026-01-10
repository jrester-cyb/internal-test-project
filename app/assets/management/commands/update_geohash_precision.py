from django.core.management.base import BaseCommand
from assets.models import Asset
import h3


class Command(BaseCommand):
    help = "Update all assets with a new H3 index of resolution 12"

    def handle(self, *args, **options):
        updated = 0
        for asset in Asset.objects.all():
            if asset.geometry:
                centroid = asset.geometry.centroid
                if centroid:
                    asset.geohash = h3.latlng_to_cell(centroid.y, centroid.x, 12)
                    asset.save(update_fields=["geohash"])
                    updated += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"Updated {updated} assets with H3 index at resolution 12"
            )
        )
