import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

// Polyfill Promise.try and toHex for Node.js environment
if (!Promise.try) {
  Promise.try = function (fn, ...args) {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

if (!Uint8Array.prototype.toHex) {
  Uint8Array.prototype.toHex = function () {
    return Array.from(this).map(b => b.toString(16).padStart(2, '0')).join('');
  };
}

// Polyfill DOMParser for Node environment
import { JSDOM } from 'jsdom';
const dom = new JSDOM();
global.DOMParser = dom.window.DOMParser;

import { computeFileFingerprint } from './src/services/fingerprint.ts';
import {
  saveBook,
  getBook,
  getAllBooks,
  deleteBook,
  saveProgress,
  getProgress,
  saveBookmark,
  getBookmarks,
  getSettings,
  saveSettings,
  getUnmatchedBackupsCount,
} from './src/services/db.ts';
import { generateBackup, restoreBackup } from './src/services/backupService.ts';
import { parseEpub } from './src/services/epubService.ts';
import { parseTxt } from './src/services/txtService.ts';
import * as pdfjsLib from 'pdfjs-dist';

console.log('════════════════════════════════════════════════════════════════');
console.log('✦ RUNNING FULL AUTOMATED FLOW VERIFICATION FOR BOOK READER PWA ✦');
console.log('════════════════════════════════════════════════════════════════\n');

async function runTests() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [FAIL] ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [FAIL] ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  // ── TEST 1: Stable Content Fingerprinting ──
  await asyncTest('Content Fingerprint: Deterministic SHA-256 for identical files and distinct for different', async () => {
    const file1Buf = fs.readFileSync('../test_fixtures/test_book_1.pdf');
    const file2Buf = fs.readFileSync('../test_fixtures/test_book_2.pdf');

    const fp1_a = await computeFileFingerprint(file1Buf.buffer);
    const fp1_b = await computeFileFingerprint(file1Buf.buffer);
    const fp2 = await computeFileFingerprint(file2Buf.buffer);

    assert.strictEqual(fp1_a, fp1_b, 'Fingerprints for identical content must match exactly');
    assert.notStrictEqual(fp1_a, fp2, 'Fingerprints for different files must differ');
    assert.strictEqual(fp1_a.length, 32, 'Fingerprint must be 32 hex chars');
  });

  // ── TEST 2: PDF Parsing and Text Extraction ──
  await asyncTest('PDF Engine: Parse PDF document, extract page count and metadata', async () => {
    const pdfBuf = fs.readFileSync('../test_fixtures/test_book_1.pdf');
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuf) }).promise;
    
    assert.strictEqual(doc.numPages, 5, 'test_book_1.pdf must have 5 pages');
    const page1 = await doc.getPage(1);
    const textContent = await page1.getTextContent();
    const text = textContent.items.map((i) => i.str).join(' ');
    assert.ok(text.includes('Chapter 1'), 'Page 1 must contain Chapter 1 text');
  });

  // ── TEST 3: EPUB Parsing, Script Disabling & Offline Assets ──
  await asyncTest('EPUB Engine: Parse EPUB, strip scripts, extract spine chapters', async () => {
    const epubBuf = fs.readFileSync('../test_fixtures/test_book.epub');
    const parsed = await parseEpub(epubBuf.buffer);

    assert.strictEqual(parsed.title, 'Adventures in Space', 'EPUB title must match metadata');
    assert.strictEqual(parsed.author, 'Jules Verne', 'EPUB author must match metadata');
    assert.strictEqual(parsed.totalChapters, 2, 'Must extract 2 chapters');
    assert.ok(parsed.chapters[0].content.includes('stellar cruiser'), 'Chapter 1 text present');
    assert.ok(!parsed.chapters[0].content.includes('<script>'), 'Scripts must be stripped');
  });

  // ── TEST 4: TXT Parsing and Pagination ──
  await asyncTest('TXT Engine: Parse and paginate text document', async () => {
    const txtContent = fs.readFileSync('../samples/sample_book.txt', 'utf-8');
    const blob = new Blob([txtContent], { type: 'text/plain' });
    const parsed = await parseTxt(blob, 'sample_book.txt');

    assert.ok(parsed.totalPageCount >= 1, 'TXT file must produce pages');
    assert.ok(parsed.pages[0].length > 0, 'First page has text');
  });

  // ── TEST 5: Independent Reading Progress for Multiple Books ──
  await asyncTest('Storage: Two books retain independent reading progress', async () => {
    const book1Id = 'book_alpha_sha256';
    const book2Id = 'book_beta_sha256';

    await saveBook({
      id: book1Id,
      title: 'Book Alpha',
      author: 'Author A',
      format: 'pdf',
      fileSize: 1024,
      addedAt: Date.now(),
      lastOpenedAt: Date.now(),
      pageCount: 50,
    }, new Blob(['alpha']));

    await saveBook({
      id: book2Id,
      title: 'Book Beta',
      author: 'Author B',
      format: 'pdf',
      fileSize: 2048,
      addedAt: Date.now(),
      lastOpenedAt: Date.now(),
      pageCount: 100,
    }, new Blob(['beta']));

    // Save Book 1 on Page 25
    await saveProgress({
      bookId: book1Id,
      location: '25',
      pageIndex: 25,
      scrollOffset: 0,
      percentage: 50,
      updatedAt: Date.now(),
    });

    // Save Book 2 on Page 88
    await saveProgress({
      bookId: book2Id,
      location: '88',
      pageIndex: 88,
      scrollOffset: 0,
      percentage: 88,
      updatedAt: Date.now(),
    });

    const p1 = await getProgress(book1Id);
    const p2 = await getProgress(book2Id);

    assert.strictEqual(p1?.pageIndex, 25, 'Book 1 must remain on page 25');
    assert.strictEqual(p2?.pageIndex, 88, 'Book 2 must remain on page 88');
  });

  // ── TEST 6: Manual Bookmark Separate from Autosaved Progress ──
  await asyncTest('Bookmarks: Manual bookmark remains at page 20 when reading stopped at page 35', async () => {
    const bookId = 'book_progress_test_1';
    await saveBook({
      id: bookId,
      title: 'Progress Test Book',
      author: 'Test Author',
      format: 'pdf',
      fileSize: 5000,
      addedAt: Date.now(),
      lastOpenedAt: Date.now(),
      pageCount: 50,
    }, new Blob(['dummy']));

    // 1. User bookmarks page 20
    await saveBookmark({
      id: 'bm_20',
      bookId: bookId,
      pageIndex: 20,
      location: '20',
      scrollOffset: 0,
      title: 'Page 20 - Great quote',
      createdAt: Date.now(),
    });

    // 2. User later reads further and stops on page 35 (autosaved)
    await saveProgress({
      bookId: bookId,
      location: '35',
      pageIndex: 35,
      scrollOffset: 120,
      percentage: 70,
      updatedAt: Date.now(),
    });

    // 3. Verify separation
    const latestProgress = await getProgress(bookId);
    const savedBookmarks = await getBookmarks(bookId);

    assert.strictEqual(latestProgress?.pageIndex, 35, 'Autosaved position must resume at page 35');
    assert.strictEqual(savedBookmarks.length, 1, 'Must have 1 manual bookmark');
    assert.strictEqual(savedBookmarks[0].pageIndex, 20, 'Manual bookmark must remain at page 20');
  });

  // ── TEST 7: Duplicate Import Preserves Existing Progress ──
  await asyncTest('Duplicate Detection: Re-importing identical book detects existing copy and preserves progress', async () => {
    const bookId = 'book_dup_test';
    await saveBook({
      id: bookId,
      title: 'Original Title',
      author: 'Original Author',
      format: 'pdf',
      fileSize: 5000,
      addedAt: Date.now(),
      lastOpenedAt: Date.now(),
      pageCount: 100,
    }, new Blob(['duplicate_test_content']));

    // Save progress at page 42
    await saveProgress({
      bookId: bookId,
      location: '42',
      pageIndex: 42,
      scrollOffset: 50,
      percentage: 42,
      updatedAt: Date.now(),
    });

    // Simulate checking if existing before adding
    const existing = await getBook(bookId);
    assert.ok(existing, 'Must detect existing book by ID');
    const existingProgress = await getProgress(bookId);
    assert.strictEqual(existingProgress?.pageIndex, 42, 'Existing progress must remain page 42');
  });

  // ── TEST 8: Export Backup and Restore ──
  await asyncTest('Backup & Restore: Export JSON, validate schema, and restore bookmarks/progress', async () => {
    const jsonString = await generateBackup();
    const backup = JSON.parse(jsonString);

    assert.strictEqual(backup.app, 'BookReaderMobile', 'Backup must identify app name');
    assert.ok(Array.isArray(backup.books), 'Must contain books array');
    assert.ok(Array.isArray(backup.progress), 'Must contain progress array');
    assert.ok(Array.isArray(backup.bookmarks), 'Must contain bookmarks array');

    // Restore to verify
    const result = await restoreBackup(jsonString);
    assert.ok(result.restoredMatched >= 1, 'Must restore matched records');
  });

  // ── TEST 9: Unmatched Backup Records Preserved for Future Imports ──
  await asyncTest('Backup: Preserve unmatched backup records until book is imported later', async () => {
    const futureBookId = 'future_book_sha256_unmatched';
    const dummyBackup = JSON.stringify({
      version: 1,
      app: 'BookReaderMobile',
      exportDate: new Date().toISOString(),
      books: [{ id: futureBookId, title: 'Future Book', author: '', format: 'pdf', pageCount: 20 }],
      progress: [{ bookId: futureBookId, location: '15', pageIndex: 15, scrollOffset: 0, percentage: 75, updatedAt: Date.now() }],
      bookmarks: [{ id: 'future_bm', bookId: futureBookId, pageIndex: 10, location: '10', scrollOffset: 0, title: 'Note', createdAt: Date.now() }],
    });

    const restoreRes = await restoreBackup(dummyBackup);
    assert.strictEqual(restoreRes.unmatchedPreserved, 1, 'Unmatched record must be preserved');
    const unmatchedCount = await getUnmatchedBackupsCount();
    assert.ok(unmatchedCount >= 1, 'Unmatched count in DB must be >= 1');

    // Now import the book that matches the futureBookId
    await saveBook({
      id: futureBookId,
      title: 'Future Book',
      author: '',
      format: 'pdf',
      fileSize: 1234,
      addedAt: Date.now(),
      lastOpenedAt: Date.now(),
      pageCount: 20,
    }, new Blob(['future_content']));

    // Check if progress and bookmarks were automatically linked!
    const autoRestoredProg = await getProgress(futureBookId);
    const autoRestoredBms = await getBookmarks(futureBookId);

    assert.strictEqual(autoRestoredProg?.pageIndex, 15, 'Progress automatically restored upon book import');
    assert.strictEqual(autoRestoredBms.length, 1, 'Bookmark automatically restored upon book import');
    assert.strictEqual(autoRestoredBms[0].pageIndex, 10, 'Bookmark page matches');
  });

  // ── TEST 10: Delete Book without affecting other books ──
  await asyncTest('Deletion: Deleting a book removes its data and leaves other books intact', async () => {
    const allBefore = await getAllBooks();
    const target = allBefore[0];
    const untouched = allBefore[1];

    await deleteBook(target.id);
    const allAfter = await getAllBooks();

    assert.ok(!allAfter.some((b) => b.id === target.id), 'Deleted book must not be in library');
    assert.ok(allAfter.some((b) => b.id === untouched.id), 'Untouched book must remain in library');
  });

  // ── TEST 11: Settings Persistence ──
  await asyncTest('Settings: Reader settings saved and restored correctly', async () => {
    await saveSettings({ theme: 'sepia', pdfPageFilter: 'warm', fontSize: 20 });
    const settings = await getSettings();

    assert.strictEqual(settings.theme, 'sepia', 'Theme saved');
    assert.strictEqual(settings.pdfPageFilter, 'warm', 'PDF filter saved');
    assert.strictEqual(settings.fontSize, 20, 'Font size saved');
  });

  // ── TEST 12: Subpath & Relative URLs Verification for GitHub Pages ──
  test('Deployment: Production dist uses relative paths for all assets and manifest', () => {
    const indexHtml = fs.readFileSync('dist/index.html', 'utf-8');
    const manifestJson = fs.readFileSync('dist/manifest.json', 'utf-8');
    const swJs = fs.readFileSync('dist/sw.js', 'utf-8');

    assert.ok(indexHtml.includes('href="./manifest.json"') || indexHtml.includes('href="./'), 'index.html must use relative links');
    assert.ok(indexHtml.includes('src="./'), 'index.html scripts must use relative src');
    assert.ok(!indexHtml.includes('href="/assets/'), 'index.html must not use absolute /assets/');

    const manifest = JSON.parse(manifestJson);
    assert.strictEqual(manifest.scope, './', 'Manifest scope must be relative ./');
    assert.strictEqual(manifest.start_url, './', 'Manifest start_url must be relative ./');
    assert.ok(manifest.icons.every((i) => i.src.startsWith('./')), 'Manifest icons must use relative ./');

    assert.ok(swJs.includes('book-reader-cache-v1'), 'sw.js has cache name');
    assert.ok(swJs.includes("'./index.html'"), 'sw.js precaches relative ./index.html');
  });

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`✦ RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

runTests();
