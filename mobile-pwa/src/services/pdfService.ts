import * as pdfjsLib from 'pdfjs-dist';

// Point worker to local self-hosted worker inside public/pdfjs/
// This ensures 100% offline functionality without any CDN dependency.
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.min.mjs';
}

export type PdfDoc = pdfjsLib.PDFDocumentProxy;

export interface PageRenderResult {
  renderedWidth: number;
  renderedHeight: number;
  scale: number;
}

let activeRenderTask: any = null;

export async function loadPdfDocument(
  data: Blob | ArrayBuffer,
  password?: string
): Promise<PdfDoc> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: './pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: './pdfjs/standard_fonts/',
    password: password || undefined,
  });

  return loadingTask.promise;
}

/**
 * Renders a specific page to a canvas, handling cancellation of any in-flight rendering.
 */
export async function renderPdfPage(
  doc: PdfDoc,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  containerWidth: number,
  fitMode: 'width' | 'page' = 'width',
  zoomMultiplier: number = 1.0
): Promise<PageRenderResult> {
  // Cancel previous render if still in progress
  if (activeRenderTask) {
    try {
      activeRenderTask.cancel();
    } catch {
      // Ignored
    }
    activeRenderTask = null;
  }

  const page = await doc.getPage(pageNumber);
  const unscaledViewport = page.getViewport({ scale: 1.0 });

  // Calculate fit-to-width scale based on mobile container width
  const padding = 16;
  const availableWidth = Math.max(280, containerWidth - padding);
  let baseScale = availableWidth / unscaledViewport.width;

  if (fitMode === 'page') {
    const availableHeight = Math.max(300, window.innerHeight - 140);
    const scaleY = availableHeight / unscaledViewport.height;
    baseScale = Math.min(baseScale, scaleY);
  }

  // Multiply by user manual zoom level
  const finalScale = baseScale * zoomMultiplier;
  const pixelRatio = window.devicePixelRatio || 1;

  const viewport = page.getViewport({ scale: finalScale * pixelRatio });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
  canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  const renderContext = {
    canvasContext: ctx,
    canvas: canvas,
    viewport: viewport,
    intent: 'display' as const,
  };

  const renderTask = page.render(renderContext);
  activeRenderTask = renderTask;

  try {
    await renderTask.promise;
  } catch (err: any) {
    if (err?.name === 'RenderingCancelledException') {
      // Intentional page flip cancellation, ignore
      return {
        renderedWidth: viewport.width / pixelRatio,
        renderedHeight: viewport.height / pixelRatio,
        scale: finalScale,
      };
    }
    throw err;
  } finally {
    if (activeRenderTask === renderTask) {
      activeRenderTask = null;
    }
  }

  return {
    renderedWidth: viewport.width / pixelRatio,
    renderedHeight: viewport.height / pixelRatio,
    scale: finalScale,
  };
}

/**
 * Extracts a short text snippet from the given page for bookmark titles.
 */
export async function getPdfPageSnippet(doc: PdfDoc, pageNumber: number): Promise<string> {
  try {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item: any) => item.str || '')
      .filter((s: string) => s.trim().length > 0);
    
    const combined = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (!combined) return '';
    return combined.length > 80 ? combined.slice(0, 77) + '...' : combined;
  } catch {
    return '';
  }
}
