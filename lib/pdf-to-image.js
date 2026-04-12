// Browser-only — do not import in server components or API routes

let _pdfjs = null;

async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  _pdfjs = await import('pdfjs-dist');
  // Use CDN worker (unpkg always has the matching version, CORS-enabled)
  _pdfjs.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${_pdfjs.version}/build/pdf.worker.min.mjs`;
  return _pdfjs;
}

/**
 * Renders the first page of a single-page PDF File to a JPEG Blob.
 * Uses pdfjs-dist with a CDN worker.
 *
 * @param {File|Blob} pdfFile - A (preferably single-page) PDF
 * @param {number}    scale   - Render scale; 2.5 ≈ 180 dpi — good for label OCR
 * @returns {Promise<Blob>}   JPEG image blob
 */
export async function pdfPageToJpeg(pdfFile, scale = 2.5) {
  const pdfjs = await loadPdfjs();

  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/jpeg', 0.92);
  });
}
