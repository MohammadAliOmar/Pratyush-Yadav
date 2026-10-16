/**
 * CampusFind Semantic Description Similarity Engine
 *
 * Client-side placeholder (token cosine similarity). The sentence-embedding model (MiniLM) is the production design and is NOT implemented in this build.
 *
 * NOTE FOR NIT3003/NIT3004 ARCHITECTURE:
 * This is the modular placeholder for the semantic sentence-embedding model
 * (e.g., all-MiniLM-L6-v2 via sentence-transformers running server-side / Cloud Functions).
 *
 * It takes two descriptions and outputs a cosine similarity coefficient between 0.0 and 1.0.
 * In production, embeddings are calculated once at report submission and stored in the document.
 */

// Tokenizes and normalizes text for token-level TF-IDF / Jaccard cosine placeholder
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

/**
 * Pre-tokenizes text at submission time so it doesn't need to be recalculated on every comparison
 * (Scalability requirement 3.1)
 */
export function extractDescriptionTokens(text: string): string[] {
  return tokenize(text);
}

/**
 * computeDescriptionSimilarity(textA, textB)
 * Computes semantic description similarity between 0.0 and 1.0.
 *
 * Currently uses word n-gram and token cosine overlap as a client-side placeholder.
 * In the final deployment, this is replaced by dot-product / cosine similarity of 384-dim embeddings.
 */
export function computeDescriptionSimilarity(textA: string, textB: string): number {
  if (!textA || !textB) return 0.0;
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);

  if (tokensA.length === 0 || tokensB.length === 0) return 0.0;

  // Build term frequency vectors
  const freqA: Record<string, number> = {};
  const freqB: Record<string, number> = {};

  for (const t of tokensA) freqA[t] = (freqA[t] || 0) + 1;
  for (const t of tokensB) freqB[t] = (freqB[t] || 0) + 1;

  const allWords = new Set([...Object.keys(freqA), ...Object.keys(freqB)]);

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const word of allWords) {
    const a = freqA[word] || 0;
    const b = freqB[word] || 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) return 0.0;
  const cosine = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

  // Also consider exact substring match or phrase overlap boost
  const cleanA = textA.trim().toLowerCase();
  const cleanB = textB.trim().toLowerCase();
  let bonus = 0;
  if (cleanA === cleanB) {
    bonus = 0.3;
  } else if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) {
    bonus = 0.15;
  }

  return Math.min(1.0, Math.max(0.0, Number((cosine + bonus).toFixed(4))));
}
