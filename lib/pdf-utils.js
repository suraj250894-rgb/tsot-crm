import { PDFDocument } from 'pdf-lib';

/**
 * Splits a PDF File into batches of `batchSize` pages.
 * Returns an array of File objects (each is a smaller PDF).
 * If the PDF has fewer or equal pages than batchSize, returns [file] unchanged.
 */
export async function splitPdfIntoBatches(file, batchSize = 3) {
  const arrayBuffer = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(arrayBuffer);
  const pageCount = srcDoc.getPageCount();

  if (pageCount <= batchSize) {
    return [file];
  }

  const baseName = file.name.replace(/\.pdf$/i, '');
  const batches = [];

  for (let start = 0; start < pageCount; start += batchSize) {
    const end = Math.min(start + batchSize, pageCount);
    const indices = Array.from({ length: end - start }, (_, i) => start + i);

    const batchDoc = await PDFDocument.create();
    const pages = await batchDoc.copyPages(srcDoc, indices);
    pages.forEach((p) => batchDoc.addPage(p));

    const bytes = await batchDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const batchNum = Math.floor(start / batchSize) + 1;
    const batchFile = new File([blob], `${baseName}-batch${batchNum}.pdf`, { type: 'application/pdf' });
    batches.push(batchFile);
  }

  return batches;
}
