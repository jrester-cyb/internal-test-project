import base64

from qr_code.qrcode.utils import QRCodeOptions
from qr_code.qrcode.maker import make_qr_code_image


def generate_qr_code_data_url(data: str, size: int = 10) -> str:
    """
    Generate a QR code as a base64-encoded data URL using django-qr-code.

    Args:
        data: The data to encode in the QR code
        size: The size parameter for the QR code (default: 10)

    Returns:
        A data URL string (e.g., "data:image/svg+xml;base64,...")
    """
    options = QRCodeOptions(size=size, image_format="svg")
    svg_content = make_qr_code_image(data, qr_code_options=options)

    # Handle both bytes and string return types
    if isinstance(svg_content, bytes):
        svg_base64 = base64.b64encode(svg_content).decode("utf-8")
    else:
        svg_base64 = base64.b64encode(svg_content.encode("utf-8")).decode("utf-8")

    return f"data:image/svg+xml;base64,{svg_base64}"
