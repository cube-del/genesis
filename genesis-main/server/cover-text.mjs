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

export { quoteFragments } from '../public/memory.js';
