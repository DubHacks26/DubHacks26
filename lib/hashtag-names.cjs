// Canonical names are also the text passed to the model. Spaces and underscores
// deliberately identify the same hashtag; display names use underscores.
function normalizeHashtag(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^#+/, '').replace(/_/g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function uniqueHashtagNames(products) {
  return [...new Set(products.flatMap(product =>
    (Array.isArray(product.hashtags) ? product.hashtags : [])
      .map(normalizeHashtag).filter(Boolean)))].sort();
}

module.exports = { normalizeHashtag, uniqueHashtagNames };
