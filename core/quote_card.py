"""Quote Card Generator using Pillow for Book Reader.

Generates a 1080x1080 PNG image with auto-sized quote text,
book title, and author. Supports 3 templates: dark, light, and sepia.
"""

from __future__ import annotations

import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


TEMPLATES = {
    "dark": {
        "bg": (20, 18, 16),             # #141210 deep obsidian
        "inner_border": (212, 175, 85, 75),  # Subtle gold border
        "quote_mark": (212, 175, 85, 200),  # Gold accent
        "quote_text": (237, 228, 211),   # #EDE4D3 ivory/cream
        "divider": (196, 179, 138, 100),
        "title_text": (212, 175, 85),    # Gold title
        "author_text": (160, 145, 125),  # Muted author
    },
    "light": {
        "bg": (250, 248, 245),           # #FAF8F5 crisp warm white
        "inner_border": (180, 140, 50, 85), # Subtle warm gold
        "quote_mark": (179, 134, 42, 220), # Warm gold
        "quote_text": (31, 27, 22),       # #1F1B16 charcoal/espresso
        "divider": (180, 150, 100, 120),
        "title_text": (138, 88, 22),     # Deep bronze
        "author_text": (110, 95, 80),    # Neutral muted
    },
    "sepia": {
        "bg": (244, 236, 216),           # #F4ECD8 warm parchment
        "inner_border": (140, 110, 70, 90), # Sepia border
        "quote_mark": (158, 107, 31, 220),# Warm sepia amber
        "quote_text": (62, 49, 32),       # #3E3120 rich brown
        "divider": (160, 130, 90, 130),
        "title_text": (122, 75, 16),     # Warm amber title
        "author_text": (124, 105, 78),   # Muted sepia author
    },
}


def _get_font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Load a system TrueType font or fallback to default."""
    win_dir = os.environ.get("WINDIR", "C:\\Windows")
    font_candidates = [
        os.path.join(win_dir, "Fonts", name),
        os.path.join(win_dir, "Fonts", "georgia.ttf"),
        os.path.join(win_dir, "Fonts", "times.ttf"),
        os.path.join(win_dir, "Fonts", "arial.ttf"),
        name,
    ]
    for path in font_candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def _wrap_text(text: str, font: ImageFont.ImageFont | ImageFont.FreeTypeFont, max_width: int, draw: ImageDraw.ImageDraw) -> list[str]:
    """Break text into lines that fit within max_width."""
    words = text.split()
    if not words:
        return [""]

    lines: list[str] = []
    current_line: list[str] = []

    for word in words:
        test_line = " ".join(current_line + [word])
        bbox = draw.textbbox((0, 0), test_line, font=font)
        w = bbox[2] - bbox[0]
        if w <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(" ".join(current_line))
                current_line = [word]
            else:
                # Single word wider than line
                lines.append(word)
                current_line = []

    if current_line:
        lines.append(" ".join(current_line))

    return lines


def generate_quote_card(
    quote: str,
    title: str,
    author: str = "",
    template: str = "dark",
) -> Image.Image:
    """Draw a 1080x1080 quote card PNG image with auto-sized text.

    Args:
        quote: The quoted text.
        title: The book title.
        author: Optional author name.
        template: 'dark', 'light', or 'sepia'.

    Returns:
        A PIL Image in RGBA mode of size 1080x1080.
    """
    canvas_size = 1080
    template_key = template.lower().strip()
    colors = TEMPLATES.get(template_key, TEMPLATES["dark"])

    # Create base image
    img = Image.new("RGBA", (canvas_size, canvas_size), colors["bg"] + (255,))
    draw = ImageDraw.Draw(img, "RGBA")

    # 1. Decorative border (inset 48px)
    inset = 48
    border_color = colors["inner_border"]
    draw.rectangle(
        [(inset, inset), (canvas_size - inset, canvas_size - inset)],
        outline=border_color,
        width=2,
    )
    # Inner thin corner accents
    corner_inset = inset + 12
    draw.rectangle(
        [(corner_inset, corner_inset), (canvas_size - corner_inset, canvas_size - corner_inset)],
        outline=(border_color[0], border_color[1], border_color[2], int(border_color[3] * 0.5)),
        width=1,
    )

    # 2. Quotation mark icon at top
    mark_font = _get_font("georgia.ttf", 96)
    mark_text = "“"
    mark_bbox = draw.textbbox((0, 0), mark_text, font=mark_font)
    mark_w = mark_bbox[2] - mark_bbox[0]
    draw.text(
        ((canvas_size - mark_w) // 2, 80),
        mark_text,
        font=mark_font,
        fill=colors["quote_mark"],
    )

    # 3. Clean up quote string
    clean_quote = quote.strip()
    # Strip wrapping quotes if user highlighted with them
    if clean_quote.startswith(('"', "“", "'")):
        clean_quote = clean_quote[1:]
    if clean_quote.endswith(('"', "”", "'")):
        clean_quote = clean_quote[:-1]
    clean_quote = clean_quote.strip()

    # 4. Auto-size quote text
    # Available bounding box for quote:
    # X: [110, 970] (width = 860)
    # Y: [210, 810] (height = 600)
    max_quote_width = 840
    max_quote_height = 580

    selected_font_size = 24
    selected_lines: list[str] = [clean_quote]
    selected_font = _get_font("georgia.ttf", selected_font_size)
    selected_line_height = 36

    # Test sizes descending from 64 down to 22
    for font_size in range(64, 21, -2):
        test_font = _get_font("georgia.ttf", font_size)
        test_lines = _wrap_text(clean_quote, test_font, max_quote_width, draw)
        
        # Line height approx font_size * 1.45
        sample_bbox = draw.textbbox((0, 0), "Ay", font=test_font)
        single_line_h = sample_bbox[3] - sample_bbox[1]
        line_spacing = max(8, int(font_size * 0.45))
        line_step = single_line_h + line_spacing
        total_h = len(test_lines) * line_step - line_spacing

        if total_h <= max_quote_height:
            selected_font_size = font_size
            selected_lines = test_lines
            selected_font = test_font
            selected_line_height = line_step
            break

    # Calculate vertical centering for quote block in the quote zone
    quote_zone_top = 210
    quote_zone_height = 580
    total_quote_h = len(selected_lines) * selected_line_height
    start_y = quote_zone_top + max(0, (quote_zone_height - total_quote_h) // 2)

    # Draw quote lines (centered horizontally)
    for i, line in enumerate(selected_lines):
        line_bbox = draw.textbbox((0, 0), line, font=selected_font)
        line_w = line_bbox[2] - line_bbox[0]
        x = (canvas_size - line_w) // 2
        y = start_y + (i * selected_line_height)
        draw.text((x, y), line, font=selected_font, fill=colors["quote_text"])

    # 5. Bottom metadata section (Divider, Title, Author)
    divider_y = 860
    divider_width = 160
    draw.line(
        [
            ((canvas_size - divider_width) // 2, divider_y),
            ((canvas_size + divider_width) // 2, divider_y),
        ],
        fill=colors["divider"],
        width=2,
    )

    # Book title
    title_font = _get_font("georgia.ttf", 30)
    display_title = title.strip()
    if len(display_title) > 55:
        display_title = display_title[:52] + "..."
    title_bbox = draw.textbbox((0, 0), display_title, font=title_font)
    title_w = title_bbox[2] - title_bbox[0]
    draw.text(
        ((canvas_size - title_w) // 2, 890),
        display_title,
        font=title_font,
        fill=colors["title_text"],
    )

    # Author if known
    clean_author = author.strip()
    if clean_author:
        author_text = f"by {clean_author}"
        author_font = _get_font("arial.ttf", 22)
        author_bbox = draw.textbbox((0, 0), author_text, font=author_font)
        author_w = author_bbox[2] - author_bbox[0]
        draw.text(
            ((canvas_size - author_w) // 2, 940),
            author_text,
            font=author_font,
            fill=colors["author_text"],
        )

    return img
