/**
 * Fuzzy match an invoice product name against the catalog.
 * Uses word-overlap scoring with a 35% threshold.
 */

// Tokenize: split on whitespace, dashes, em-dashes, commas; drop short tokens
function tokenize(str) {
  return str
    .toLowerCase()
    .split(/[\s\u2013\u2014\-,/]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 2);
}

export function fuzzyMatch(invoiceName, catalog) {
  const invoiceTokens = tokenize(invoiceName);
  if (!invoiceTokens.length) return null;

  let best = null;
  let bestScore = 0;

  for (const item of catalog) {
    const catalogTokens = tokenize(item.n);
    if (!catalogTokens.length) continue;

    // Count overlapping tokens (substring match both ways)
    const matched = invoiceTokens.filter((iw) =>
      catalogTokens.some((cw) => cw.includes(iw) || iw.includes(cw))
    ).length;

    const score = matched / Math.max(invoiceTokens.length, catalogTokens.length);

    if (score > bestScore && score >= 0.35) {
      bestScore = score;
      best = item;
    }
  }

  return best;
}

/**
 * Run fuzzy matching for all order items in a lot.
 * Returns array of { id, matched_catalog_name, matched_catalog_image }
 */
export async function matchOrderItems(orderItems, catalog) {
  return orderItems.map((item) => {
    const match = fuzzyMatch(item.product_name, catalog);
    return {
      id: item.id,
      matched_catalog_name: match ? match.n : null,
      matched_catalog_image: match ? match.i : null,
    };
  });
}
