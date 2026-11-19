"""Правила оформления «Поля дня». Запуск: python art_engine.py examples/park.json"""

import argparse
import json
import re
import sys
from pathlib import Path
from statistics import mean


MODE_NAMES = {"wash": "Мягкий свет", "grid": "Ритм линий", "paper": "Бумажная пауза"}
PACE_SECONDS = {"slow": 6.0, "steady": 4.0, "fast": 2.5}
PACE_NAMES = {"slow": "медленный", "steady": "умеренный", "fast": "быстрый"}


def _object(value, field):
    if not isinstance(value, dict):
        raise ValueError(f"{field} должен быть объектом JSON")
    return value


def _number(value, field, minimum, maximum):
    if type(value) not in (int, float) or not minimum <= value <= maximum:
        raise ValueError(f"{field} должен быть числом от {minimum} до {maximum}")
    return value


def _caption_ink(background):
    # Относительная яркость sRGB и выбор большего контраста по WCAG.
    channels = [int(background[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    red, green, blue = [
        c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
        for c in channels
    ]
    luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    black_contrast = (luminance + 0.05) / 0.05
    white_contrast = 1.05 / (luminance + 0.05)
    return "#000000" if black_contrast >= white_contrast else "#FFFFFF"


def _music_timing(music):
    source = music.get("source")
    if source == "description":
        pace = music.get("pace")
        if not isinstance(pace, str) or pace not in PACE_SECONDS:
            raise ValueError("music.pace должен быть slow, steady или fast")
        seconds = PACE_SECONDS[pace]
        return {
            "source": source, "frame_seconds": seconds, "clip_seconds": None, "levels": [],
        }, f"Темп по описанию — {PACE_NAMES[pace]}. Один кадр держится {seconds:g} с."

    if source != "analysis":
        raise ValueError("music.source должен быть analysis или description")
    duration = _number(music.get("clip_seconds"), "music.clip_seconds", 0.001, 30)
    levels = music.get("levels")
    if not isinstance(levels, list) or len(levels) != 8:
        raise ValueError("music.levels должен содержать 8 уровней громкости")
    for index, level in enumerate(levels):
        _number(level, f"music.levels[{index}]", 0, 1)

    if "bpm" not in music:
        raise ValueError("Укажите music.bpm или null для неопределённого темпа")
    bpm = music["bpm"]
    if bpm is None:
        seconds = PACE_SECONDS["steady"]
        reason = f"Темп определить не удалось. Базовая длительность кадра — {seconds:g} с."
    else:
        _number(bpm, "music.bpm", 30, 300)
        seconds = round(8 * 60 / bpm, 3)
        reason = f"Темп {bpm:g} BPM. Восемь долей дают {seconds:g} с на кадр."
    return {
        "source": source, "frame_seconds": seconds, "clip_seconds": duration,
        "levels": list(levels),
    }, reason + f" Восемь отметок показывают громкость первых {duration:g} с."


def build_recipe(signals):
    """Преобразует словарь сигналов версии 1 в сохраняемый JSON-рецепт."""
    _object(signals, "signals")
    if type(signals.get("version")) is not int or signals["version"] != 1:
        raise ValueError("Поддерживается версия сигналов 1")
    text = _object(signals.get("text"), "text")
    quote = text.get("quote")
    if not isinstance(quote, str) or not quote.strip():
        raise ValueError("text.quote должен содержать фразу из записи")
    warmth = _number(text.get("warmth"), "text.warmth", 0, 1)
    activity = _number(text.get("activity"), "text.activity", 0, 1)
    geometry = round(100 * activity)
    wash = round((100 - geometry) * warmth)
    mix = {"wash": wash, "grid": geometry, "paper": 100 - geometry - wash}
    mode = max(mix, key=mix.get)
    inset = round(4 + 0.18 * mix["paper"], 1)

    photo = _object(signals.get("photo"), "photo")
    palette = photo.get("palette")
    if not isinstance(palette, list) or not 1 <= len(palette) <= 5:
        raise ValueError("photo.palette должен содержать от 1 до 5 цветов")
    if any(not isinstance(c, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", c) for c in palette):
        raise ValueError("Каждый цвет photo.palette должен иметь формат #RRGGBB")
    palette = [c.upper() for c in palette]
    background = palette[0]
    ink = _caption_ink(background)

    timing, music_reason = _music_timing(_object(signals.get("music"), "music"))
    levels = timing["levels"]
    # Толщина линии в карточке шириной 400 px. Рендер масштабирует её вместе с карточкой.
    accent_width = round(1 + 3 * mean(levels), 2) if levels else 1.0
    if levels:
        music_reason += f" Средняя громкость задаёт толщину линии {accent_width:g} px."
    return {
        "version": 1,
        "mode": mode,
        "mix_pct": mix,
        "photo_inset_pct": inset,
        "palette": palette,
        "caption": {"text": quote.strip(), "background": background, "ink": ink},
        "timing": timing,
        "accent_width_px": accent_width,
        "explanation": {
            "text": (
                f"Теплота {warmth:.0%}, насыщенность событиями {activity:.0%}. "
                f"Ведущий приём «{MODE_NAMES[mode]}» ({mix[mode]}%). Поля слева и справа — по {inset:g}%."
            ),
            "photo": f"Самый частый цвет снимков {background} задаёт фон подписи. Цвет букв {ink} выбран по контрасту.",
            "music": music_reason,
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("signals", type=Path, help="файл сигналов в JSON (UTF-8)")
    args = parser.parse_args()
    try:
        signals = json.loads(args.signals.read_text(encoding="utf-8-sig"))
        recipe = build_recipe(signals)
    except (ValueError, OSError) as error:
        parser.exit(2, f"Ошибка входных данных: {error}\n")
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(recipe, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
