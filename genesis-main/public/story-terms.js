export const words = value => value.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu) || [];
export const normalize = word => word.toLowerCase().replaceAll('ё', 'е');
const modifier = /^(?:так|очень|совсем|особенно|слишком|такая|такой|было|был|была|были|стало|оказалась|оказался|any|very|really)$/iu;


// Keep negation within its clause so missing details do not drive the design.
export function* storyTerms(text) {
  let weight = 1;
  for (const clause of text.split(/([.!?;\n]+|[,—:]|(?<!\p{L})(?:но|зато|однако|but|yet)(?!\p{L}))/iu)) {
    if (/^(?:но|зато|однако|but|yet)$/iu.test(clause)) { weight = 1.65; continue; }
    if (/^[.!?;\n]/u.test(clause)) weight = 1;
    const terms = words(clause);
    let negated = false, remaining = 0, start = 0;
    for (const [index, word] of terms.entries()) {
      const token = normalize(word);
      if (/^(?:не|ни|без|нет|not|no|without)$/u.test(token)) {
        negated = !/^(?:только|лишь|only)$/iu.test(terms[index + 1] || '');
        remaining = 2;
        start = index;
        continue;
      }
      if (/^(?:и|а|and)$/u.test(token)) negated = false;
      const followedByNegation = /^(?:не (?:было|стало)|нет)(?: |$)/iu.test(terms.slice(index + 1, index + 3).join(' '));
      const negatedPhrase = negated ? terms.slice(start, index + 1).join(' ')
        : followedByNegation ? terms.slice(index, index + 3).join(' ') : '';
      yield { word, token, negatedPhrase, weight };
      if (!modifier.test(token)) {
        // An adjective can extend the negation to the noun («не радостная встреча»).
        const adjective = /(?:ая|яя|ую|юю|ый|ий|ой|ые|ие|ое|ее|ых|их|ого|ему|ому)$/iu.test(token);
        if (--remaining <= 0 || !adjective) negated = false;
      }
    }
  }
}
