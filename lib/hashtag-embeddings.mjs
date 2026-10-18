import { embedText } from './product-embeddings.mjs';
import names from './hashtag-names.cjs';

export function embedHashtag(hashtag) {
  return embedText(names.normalizeHashtag(hashtag));
}
