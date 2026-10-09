import os
import zipfile
import fitz

os.makedirs('test_fixtures', exist_ok=True)

# 1. Create test_book_1.pdf (5 pages)
doc1 = fitz.open()
for i in range(1, 6):
    page = doc1.new_page(width=595, height=842)
    page.insert_text((50, 80), f'Test Book One - Chapter {i}', fontsize=20, color=(0.2, 0.15, 0.1))
    page.insert_text((50, 130), f'This is page {i} of the first test book. Reading progress should persist automatically.', fontsize=13, color=(0.1, 0.1, 0.1))
    page.insert_text((50, 160), 'Offline mobile reading enables comfortable learning anywhere.', fontsize=12, color=(0.3, 0.3, 0.3))
doc1.set_metadata({'title': 'The Great Journey', 'author': 'Arthur Conan Doyle'})
doc1.save('test_fixtures/test_book_1.pdf')
doc1.close()

# 2. Create test_book_2.pdf (4 pages)
doc2 = fitz.open()
for i in range(1, 5):
    page = doc2.new_page(width=595, height=842)
    page.insert_text((50, 80), f'Test Book Two - Section {i}', fontsize=20, color=(0.1, 0.2, 0.3))
    page.insert_text((50, 130), f'Second book page {i}. Independent reading progress verification.', fontsize=13, color=(0.1, 0.1, 0.1))
doc2.set_metadata({'title': 'Principles of Science', 'author': 'Ada Lovelace'})
doc2.save('test_fixtures/test_book_2.pdf')
doc2.close()

# 3. Create test_book.epub
container_xml = '<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles>\n    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>'

content_opf = '<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">\n  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n    <dc:title>Adventures in Space</dc:title>\n    <dc:creator>Jules Verne</dc:creator>\n    <dc:language>en</dc:language>\n  </metadata>\n  <manifest>\n    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>\n    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>\n  </manifest>\n  <spine>\n    <itemref idref="ch1"/>\n    <itemref idref="ch2"/>\n  </spine>\n</package>'

ch1_html = '<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml">\n<head><title>Chapter 1: The Departure</title></head>\n<body>\n  <h1>Chapter 1: The Departure</h1>\n  <p>The stellar cruiser was prepared for departure under the quiet glow of two moons.</p>\n  <p>The captain verified the navigation coordinates before initiating the jump sequence.</p>\n</body>\n</html>'

ch2_html = '<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml">\n<head><title>Chapter 2: Orbit</title></head>\n<body>\n  <h1>Chapter 2: Orbit</h1>\n  <p>Entering the celestial orbit revealed rings of ice and golden cosmic dust.</p>\n</body>\n</html>'

with zipfile.ZipFile('test_fixtures/test_book.epub', 'w') as z:
    z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
    z.writestr('META-INF/container.xml', container_xml)
    z.writestr('OEBPS/content.opf', content_opf)
    z.writestr('OEBPS/ch1.xhtml', ch1_html)
    z.writestr('OEBPS/ch2.xhtml', ch2_html)

# 4. Create test_corrupted.pdf
with open('test_fixtures/test_corrupted.pdf', 'wb') as f:
    f.write(b'%PDF-1.4\n%Corrupted file content without valid xref table')

print('Test fixtures successfully created!')
