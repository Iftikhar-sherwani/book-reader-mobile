"""Cover extraction and caching service for Book Reader.

Renders first page for PDF using PyMuPDF (fitz) or extracts cover image from EPUB.
Caches covers as PNG files in covers/ folder for instantaneous loading.
"""

import io
import re
import zipfile
from pathlib import Path
import fitz
from PIL import Image

COVERS_DIR = Path(__file__).resolve().parent.parent / "covers"


def get_cover_path(book_id: str) -> Path:
    return COVERS_DIR / f"{book_id}.png"


def extract_pdf_cover(pdf_path: str | Path) -> bytes | None:
    """Render first page of PDF using PyMuPDF at thumbnail resolution."""
    try:
        doc = fitz.open(str(pdf_path))
        if len(doc) == 0:
            doc.close()
            return None
        page = doc[0]
        # Render at 120 DPI for sharp card thumbnails
        pix = page.get_pixmap(dpi=120)
        img_bytes = pix.tobytes("png")
        doc.close()
        return img_bytes
    except Exception:
        return None


def extract_epub_cover(epub_path: str | Path) -> bytes | None:
    """Extract embedded cover image from an EPUB file."""
    try:
        with zipfile.ZipFile(str(epub_path), "r") as z:
            # 1. Search OPF package manifest for explicit cover item
            opf_files = [n for n in z.namelist() if n.lower().endswith(".opf")]
            cover_href = None
            if opf_files:
                try:
                    opf_text = z.read(opf_files[0]).decode("utf-8", errors="ignore")
                    # <meta name="cover" content="item-id" />
                    m = re.search(r'<meta\s+[^>]*name=["\']cover["\']\s+content=["\']([^"\']+)["\']', opf_text, re.IGNORECASE)
                    if m:
                        cover_id = m.group(1)
                        item_m = re.search(rf'<item\s+[^>]*id=["\']{re.escape(cover_id)}["\'][^>]*href=["\']([^"\']+)["\']', opf_text, re.IGNORECASE)
                        if not item_m:
                            item_m = re.search(rf'<item\s+[^>]*href=["\']([^"\']+)["\'][^>]*id=["\']{re.escape(cover_id)}["\']', opf_text, re.IGNORECASE)
                        if item_m:
                            cover_href = item_m.group(1)

                    # properties="cover-image"
                    if not cover_href:
                        item_m = re.search(r'<item\s+[^>]*properties=["\'][^"\']*cover-image[^"\']*["\'][^>]*href=["\']([^"\']+)["\']', opf_text, re.IGNORECASE)
                        if item_m:
                            cover_href = item_m.group(1)
                except Exception:
                    pass

            if cover_href:
                opf_dir = "/".join(opf_files[0].split("/")[:-1])
                target = f"{opf_dir}/{cover_href}".lstrip("/") if opf_dir else cover_href.lstrip("/")
                for name in z.namelist():
                    if name.lower() == target.lower() or name.lower().endswith(cover_href.lower()):
                        return z.read(name)

            # 2. Check for image files with 'cover' in filename
            img_exts = (".png", ".jpg", ".jpeg", ".webp")
            candidates = [n for n in z.namelist() if n.lower().endswith(img_exts)]
            for cand in candidates:
                if "cover" in Path(cand).stem.lower():
                    return z.read(cand)

            # 3. If single image exists in the archive, use it
            if len(candidates) == 1:
                return z.read(candidates[0])
    except Exception:
        pass
    return None


def get_or_create_cover(book_id: str, file_path: str | Path, fmt: str) -> Path | None:
    """Return cached cover path. If missing, render/extract and cache as PNG in covers/."""
    COVERS_DIR.mkdir(parents=True, exist_ok=True)
    cached = get_cover_path(book_id)
    if cached.is_file() and cached.stat().st_size > 0:
        return cached

    path = Path(file_path)
    if not path.is_file():
        return None

    fmt_lower = fmt.lower() if fmt else path.suffix.lstrip(".").lower()
    raw_bytes = None
    if fmt_lower == "pdf":
        raw_bytes = extract_pdf_cover(path)
    elif fmt_lower == "epub":
        raw_bytes = extract_epub_cover(path)

    if not raw_bytes:
        return None

    # Save as PNG thumbnail (max width 360px for compact storage and crisp display)
    try:
        img = Image.open(io.BytesIO(raw_bytes))
        if img.width > 360:
            ratio = 360.0 / img.width
            new_size = (360, int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")
        img.save(cached, format="PNG")
        return cached
    except Exception:
        try:
            cached.write_bytes(raw_bytes)
            return cached
        except Exception:
            return None
