export const coverTextLimit = 84;

export const coverTextInstruction =
  'В coverText сожми сам рассказ до одной фразы для обложки на языке автора. ' +
  'Сохрани главное событие или ощущение и тон записи. Используй до ' + coverTextLimit +
  ' символов. Перефразируй длинный рассказ вместо копирования или обрезки начала. ' +
  'Если в записи вспоминают прошлое, передай это как воспоминание, не смешивая его с событиями дня. ' +
  'Короткую законченную фразу можно сохранить. Не добавляй фактов, которых нет в рассказе, и не обрамляй текст кавычками.';

export function normalizeCoverText(value) {
  if (typeof value !== 'string') return null;
  const line = value.trim().replace(/\s+/gu, ' ');
  return line && Array.from(line).length <= coverTextLimit ? line : null;
}

export function quoteFragments(text) {
  const result = [];
  // The model selects an index. This keeps every displayed quote traceable to
  // the author's words, even when the model would paraphrase their wording.
  for (const { segment } of new Intl.Segmenter('ru', { granularity: 'sentence' }).segment(text)) {
    let left = segment.trim();
    while (left.length > 220) {
      const boundary = left.slice(0, 220).search(/\s+\S*$/u);
      const cut = boundary >= 90 ? boundary : 220;
      result.push(left.slice(0, cut).trim());
      left = left.slice(cut).trim();
    }
    if (left) result.push(left);
  }
  return result;
}
