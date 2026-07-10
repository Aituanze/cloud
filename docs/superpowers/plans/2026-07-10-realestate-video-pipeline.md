# Пайплайн продакшна видео по недвижимости — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать Claude-скилл `realestate-video-pipeline`, дающий две переиспользуемые
дорожки сборки рекламного ролика объекта недвижимости (быструю автоматическую ffmpeg
и CapCut-черновик) из одного общего конфига `shotlist.yaml`, и применить его к уже
существующему проекту `projects/32 sotki`.

**Architecture:** Скилл живёт в `~/.claude/skills/realestate-video-pipeline/` со своим
venv и Python-модулями: `shotlist.py` (парсинг конфига), `captions.py` (генератор
karaoke-субтитров ASS из пословного тайминга), `transcribe.py` (обёртка над
faster-whisper), `build_ffmpeg.py` (полностью автоматическая сборка) и
`build_capcut_draft.py` (программная сборка черновика CapCut через `pyJianYingDraft`).

**Tech Stack:** Python 3.12, faster-whisper 1.2.1, pyJianYingDraft 0.3.0, PyYAML,
ffmpeg (через `imageio_ffmpeg`), pytest.

## Global Constraints

- Windows-окружение, PowerShell/Git Bash. Все скрипты запускаются через свой venv
  скилла (`realestate-video-pipeline/.venv`), не через системный Python.
- Формат вывода — только 9:16 (1080x1920). Поле `aspect` в конфиге зарезервировано
  на будущее и сейчас игнорируется (везде хардкод 1080x1920).
- `branding` в конфиге всегда `null` на этом этапе — брендинга нет (см. спеку),
  реализовывать не нужно, поле только зарезервировано.
- Без автоматизации кликов по интерфейсу CapCut — только генерация черновика.
  `pyJianYingDraft` — сторонняя reverse-engineered библиотека, версия зафиксирована
  (`0.3.0`) в `requirements.txt`, апгрейдить осознанно, не автоматически.
- Путь к черновикам CapCut: `%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft`.
- Директория скилла (`~/.claude/skills/...`) НЕ находится под git — коммитим только
  файлы внутри репозитория `C:\Users\1\Desktop\Cloud` (например,
  `projects/32 sotki/shotlist.yaml`, README).
- Спека: `docs/superpowers/specs/2026-07-10-real-estate-video-pipeline-design.md`.

---

### Task 1: Скелет скилла + окружение

**Files:**
- Create: `C:\Users\1\.claude\skills\realestate-video-pipeline\requirements.txt`
- Create: `C:\Users\1\.claude\skills\realestate-video-pipeline\scripts\tests\conftest.py`

**Interfaces:**
- Производит: рабочий venv по пути
  `C:\Users\1\.claude\skills\realestate-video-pipeline\.venv`, из которого запускаются
  все последующие скрипты и тесты этого плана.

- [ ] **Step 1: Создать структуру папок**

```bash
mkdir -p "C:/Users/1/.claude/skills/realestate-video-pipeline/scripts/tests"
mkdir -p "C:/Users/1/.claude/skills/realestate-video-pipeline/examples"
```

- [ ] **Step 2: Написать requirements.txt**

```
faster-whisper==1.2.1
pyJianYingDraft==0.3.0
PyYAML==6.0.3
imageio-ffmpeg==0.6.0
pytest==8.3.4
```

- [ ] **Step 3: Создать venv и поставить зависимости**

```bash
python -m venv "C:/Users/1/.claude/skills/realestate-video-pipeline/.venv"
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" -m pip install -r "C:/Users/1/.claude/skills/realestate-video-pipeline/requirements.txt"
```

Ожидается: установка проходит без ошибок (faster-whisper потянет `torch`/`ctranslate2`
как зависимости — установка может занять несколько минут).

- [ ] **Step 4: Написать conftest.py, делающий `scripts/` импортируемой из тестов**

```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
```

- [ ] **Step 5: Проверить окружение**

```bash
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" -c "import faster_whisper, pyJianYingDraft, yaml, pytest; print('ok')"
```

Ожидается вывод: `ok`

---

### Task 2: `shotlist.py` — загрузка и валидация конфига

**Files:**
- Create: `C:\Users\1\.claude\skills\realestate-video-pipeline\scripts\shotlist.py`
- Test: `C:\Users\1\.claude\skills\realestate-video-pipeline\scripts\tests\test_shotlist.py`

**Interfaces:**
- Производит: `ClipSpec(file: str, in_sec: float, out_sec: float)`,
  `CaptionsSpec(style: str, source: str)`,
  `EndcardSpec(image: str, duration: float, points: list[str])`,
  `Shotlist(title, aspect, clips: list[ClipSpec], intro: Optional[ClipSpec],
  voiceover: str, captions: CaptionsSpec, endcard: EndcardSpec, base_dir: str)`
  с методом `Shotlist.resolve(relative_path: str) -> str`,
  `load_shotlist(path: str) -> Shotlist`, исключение `ShotlistError(ValueError)`.
  Эти имена используются в Task 5, 6, 7.

- [ ] **Step 1: Написать падающий тест**

```python
# scripts/tests/test_shotlist.py
import textwrap

import pytest

from shotlist import load_shotlist, ShotlistError

VALID_YAML = textwrap.dedent("""\
    title: "Test Plot"
    aspect: "9:16"
    clips:
      - file: "video/a.mp4"
        in: 0.0
        out: 5.0
      - file: "video/b.mp4"
        in: 1.0
        out: 4.0
    voiceover:
      file: "audio/vo.mp3"
    captions:
      style: "karaoke"
      source: "whisper"
    endcard:
      image: "territory.jpeg"
      duration: 5
      points:
        - "Point one"
        - "Point two"
    """)


def test_load_valid_shotlist(tmp_path):
    path = tmp_path / "shotlist.yaml"
    path.write_text(VALID_YAML, encoding="utf-8")

    shotlist = load_shotlist(str(path))

    assert shotlist.title == "Test Plot"
    assert len(shotlist.clips) == 2
    assert shotlist.clips[0].file == "video/a.mp4"
    assert shotlist.clips[0].in_sec == 0.0
    assert shotlist.clips[0].out_sec == 5.0
    assert shotlist.captions.style == "karaoke"
    assert shotlist.endcard.points == ["Point one", "Point two"]
    assert shotlist.intro is None


def test_resolve_makes_absolute_path(tmp_path):
    path = tmp_path / "shotlist.yaml"
    path.write_text(VALID_YAML, encoding="utf-8")

    shotlist = load_shotlist(str(path))
    resolved = shotlist.resolve("video/a.mp4")

    assert resolved == str(tmp_path / "video" / "a.mp4")


def test_missing_required_field_raises(tmp_path):
    path = tmp_path / "shotlist.yaml"
    path.write_text('title: "Test"\n', encoding="utf-8")

    with pytest.raises(ShotlistError):
        load_shotlist(str(path))


def test_empty_clips_raises(tmp_path):
    broken = VALID_YAML.replace(
        'clips:\n      - file: "video/a.mp4"\n        in: 0.0\n        out: 5.0\n'
        '      - file: "video/b.mp4"\n        in: 1.0\n        out: 4.0\n',
        "clips: []\n",
    )
    path = tmp_path / "shotlist.yaml"
    path.write_text(broken, encoding="utf-8")

    with pytest.raises(ShotlistError):
        load_shotlist(str(path))


def test_invalid_captions_style_raises(tmp_path):
    broken = VALID_YAML.replace('style: "karaoke"', 'style: "invalid"')
    path = tmp_path / "shotlist.yaml"
    path.write_text(broken, encoding="utf-8")

    with pytest.raises(ShotlistError):
        load_shotlist(str(path))
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" -m pytest "C:/Users/1/.claude/skills/realestate-video-pipeline/scripts/tests/test_shotlist.py" -v
```

Ожидается: `ModuleNotFoundError: No module named 'shotlist'`

- [ ] **Step 3: Реализовать shotlist.py**

```python
# scripts/shotlist.py
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import yaml


class ShotlistError(ValueError):
    pass


@dataclass
class ClipSpec:
    file: str
    in_sec: float
    out_sec: float


@dataclass
class CaptionsSpec:
    style: str  # "karaoke" | "phrase" | "none"
    source: str  # "whisper" | "srt"


@dataclass
class EndcardSpec:
    image: str
    duration: float
    points: list


@dataclass
class Shotlist:
    title: str
    aspect: str
    clips: list
    intro: Optional[ClipSpec]
    voiceover: str
    captions: CaptionsSpec
    endcard: EndcardSpec
    base_dir: str

    def resolve(self, relative_path: str) -> str:
        return os.path.normpath(os.path.join(self.base_dir, relative_path))


REQUIRED_TOP_KEYS = ["title", "aspect", "clips", "voiceover", "captions", "endcard"]


def _parse_clip(raw: dict, field_name: str) -> ClipSpec:
    for key in ("file", "in", "out"):
        if key not in raw:
            raise ShotlistError(f"{field_name}: отсутствует обязательное поле '{key}'")
    return ClipSpec(file=raw["file"], in_sec=float(raw["in"]), out_sec=float(raw["out"]))


def load_shotlist(path: str) -> Shotlist:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    if raw is None:
        raise ShotlistError(f"{path}: пустой файл")

    missing = [k for k in REQUIRED_TOP_KEYS if k not in raw]
    if missing:
        raise ShotlistError(f"{path}: отсутствуют обязательные поля {missing}")

    if not raw["clips"]:
        raise ShotlistError(f"{path}: 'clips' не может быть пустым списком")

    base_dir = os.path.dirname(os.path.abspath(path))
    clips = [_parse_clip(c, f"clips[{i}]") for i, c in enumerate(raw["clips"])]

    intro = None
    if raw.get("intro") is not None:
        intro = _parse_clip(raw["intro"], "intro")

    captions_raw = raw["captions"]
    if captions_raw.get("style") not in ("karaoke", "phrase", "none"):
        raise ShotlistError("captions.style должен быть 'karaoke', 'phrase' или 'none'")
    if captions_raw.get("source") not in ("whisper", "srt"):
        raise ShotlistError("captions.source должен быть 'whisper' или 'srt'")
    captions = CaptionsSpec(style=captions_raw["style"], source=captions_raw["source"])

    endcard_raw = raw["endcard"]
    for key in ("image", "duration", "points"):
        if key not in endcard_raw:
            raise ShotlistError(f"endcard: отсутствует обязательное поле '{key}'")
    endcard = EndcardSpec(
        image=endcard_raw["image"],
        duration=float(endcard_raw["duration"]),
        points=list(endcard_raw["points"]),
    )

    return Shotlist(
        title=raw["title"],
        aspect=raw["aspect"],
        clips=clips,
        intro=intro,
        voiceover=raw["voiceover"]["file"],
        captions=captions,
        endcard=endcard,
        base_dir=base_dir,
    )
```

- [ ] **Step 4: Убедиться, что тесты проходят**

```bash
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" -m pytest "C:/Users/1/.claude/skills/realestate-video-pipeline/scripts/tests/test_shotlist.py" -v
```

Ожидается: 5 passed

---

### Task 3: `captions.py` — генератор karaoke-субтитров ASS

**Files:**
- Create: `C:\Users\1\.claude\skills\realestate-video-pipeline\scripts\captions.py`
- Test: `C:\Users\1\.claude\skills\realestate-video-pipeline\scripts\tests\test_captions.py`

**Interfaces:**
- Consumes: ничего из предыдущих задач напрямую (чистая функция).
- Производит: `WordTiming(word: str, start: float, end: float)`,
  `build_karaoke_ass(words: list[WordTiming], output_path: str, group_size: int = 5) -> None`.
  Используется в Task 6 (`build_ffmpeg.py`).

- [ ] **Step 1: Написать падающий тест**

```python
# scripts/tests/test_captions.py
import pytest

from captions import WordTiming, build_karaoke_ass, _fmt_time


def test_fmt_time_basic():
    assert _fmt_time(0) == "0:00:00.00"
    assert _fmt_time(61.5) == "0:01:01.50"
    assert _fmt_time(3661.004) == "1:01:01.00"


def test_build_karaoke_ass_groups_and_karaoke_tags(tmp_path):
    words = [
        WordTiming("Раз", 0.0, 0.3),
        WordTiming("два", 0.3, 0.6),
        WordTiming("три", 0.6, 1.0),
        WordTiming("четыре", 1.0, 1.5),
    ]
    out_path = tmp_path / "out.ass"

    build_karaoke_ass(words, str(out_path), group_size=2)

    content = out_path.read_text(encoding="utf-8")
    dialogue_lines = [l for l in content.splitlines() if l.startswith("Dialogue:")]

    assert len(dialogue_lines) == 2
    assert "{\\k30}Раз" in dialogue_lines[0]
    assert "{\\k30}два" in dialogue_lines[0]
    assert "{\\k40}три" in dialogue_lines[1]
    assert "{\\k50}четыре" in dialogue_lines[1]


def test_build_karaoke_ass_empty_raises(tmp_path):
    with pytest.raises(ValueError):
        build_karaoke_ass([], str(tmp_path / "out.ass"))
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" -m pytest "C:/Users/1/.claude/skills/realestate-video-pipeline/scripts/tests/test_captions.py" -v
```

Ожидается: `ModuleNotFoundError: No module named 'captions'`

- [ ] **Step 3: Реализовать captions.py**

```python
# scripts/captions.py
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class WordTiming:
    word: str
    start: float
    end: float


ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,Arial,64,&H0000FFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,60,60,90,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def _fmt_time(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    centis = int(round((secs - int(secs)) * 100))
    if centis == 100:
        centis = 0
        secs += 1
    return f"{hours:d}:{minutes:02d}:{int(secs):02d}.{centis:02d}"


def _group_words(words: list, group_size: int) -> list:
    return [words[i:i + group_size] for i in range(0, len(words), group_size)]


def build_karaoke_ass(words: list, output_path: str, group_size: int = 5) -> None:
    if not words:
        raise ValueError("build_karaoke_ass: пустой список слов")

    lines = []
    for group in _group_words(words, group_size):
        start = group[0].start
        end = group[-1].end
        karaoke_text = ""
        for w in group:
            duration_cs = max(1, int(round((w.end - w.start) * 100)))
            karaoke_text += f"{{\\k{duration_cs}}}{w.word} "
        lines.append(
            f"Dialogue: 0,{_fmt_time(start)},{_fmt_time(end)},Karaoke,,0,0,0,,{karaoke_text.strip()}"
        )

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(ASS_HEADER)
        f.write("\n".join(lines) + "\n")
```

- [ ] **Step 4: Убедиться, что тесты проходят**

```bash
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" -m pytest "C:/Users/1/.claude/skills/realestate-video-pipeline/scripts/tests/test_captions.py" -v
```

Ожидается: 3 passed

---

### Task 4: `transcribe.py` — пословный тайминг через faster-whisper

**Files:**
- Create: `C:\Users\1\.claude\skills\realestate-video-pipeline\scripts\transcribe.py`
- Test: `C:\Users\1\.claude\skills\realestate-video-pipeline\scripts\tests\test_transcribe.py`

**Interfaces:**
- Consumes: `WordTiming` из `captions.py` (Task 3).
- Производит: `transcribe_words(audio_path: str, model_size: str = "small",
  language: str = "ru") -> list[WordTiming]`. Используется в Task 6.

- [ ] **Step 1: Написать тест (интеграционный, на реальном аудио проекта)**

```python
# scripts/tests/test_transcribe.py
import os

import pytest

from transcribe import transcribe_words

VOICEOVER_PATH = r"C:\Users\1\Desktop\Cloud\projects\32 sotki\audio\voiceover_dmitry.mp3"


@pytest.mark.skipif(
    not os.path.exists(VOICEOVER_PATH),
    reason="тестовый аудиофайл проекта 32 sotki недоступен",
)
def test_transcribe_real_voiceover():
    words = transcribe_words(VOICEOVER_PATH, model_size="small", language="ru")

    assert len(words) > 50
    assert words[0].start >= 0
    for a, b in zip(words, words[1:]):
        assert b.start >= a.start
    assert words[-1].end <= 100.0
```

Примечание: тест медленный (модель `small` на CPU по ~96 секундам аудио — обычно
30-90 секунд) и при первом запуске скачивает веса модели (~500 МБ, нужен интернет).

- [ ] **Step 2: Убедиться, что тест падает**

```bash
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" -m pytest "C:/Users/1/.claude/skills/realestate-video-pipeline/scripts/tests/test_transcribe.py" -v
```

Ожидается: `ModuleNotFoundError: No module named 'transcribe'`

- [ ] **Step 3: Реализовать transcribe.py**

```python
# scripts/transcribe.py
from __future__ import annotations

from faster_whisper import WhisperModel

from captions import WordTiming


def transcribe_words(audio_path: str, model_size: str = "small", language: str = "ru") -> list:
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(audio_path, language=language, word_timestamps=True)

    words = []
    for segment in segments:
        for w in segment.words:
            words.append(WordTiming(word=w.word.strip(), start=w.start, end=w.end))

    if not words:
        raise ValueError(f"{audio_path}: faster-whisper не вернул ни одного слова")

    return words
```

- [ ] **Step 4: Убедиться, что тест проходит**

```bash
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" -m pytest "C:/Users/1/.claude/skills/realestate-video-pipeline/scripts/tests/test_transcribe.py" -v
```

Ожидается: 1 passed (может занять до пары минут)

---

### Task 5: Конфиг `shotlist.yaml` для проекта 32 sotki + пример в скилле

**Files:**
- Create: `C:\Users\1\Desktop\Cloud\projects\32 sotki\shotlist.yaml`
- Create: `C:\Users\1\.claude\skills\realestate-video-pipeline\examples\shotlist.example.yaml`

**Interfaces:**
- Производит: реальный входной файл для Task 6 и Task 7.

- [ ] **Step 1: Написать shotlist.yaml для 32 sotki (переиспользует уже готовый `rough_cut_32sotki.mp4` как единственный клип)**

```yaml
title: "32 sotki"
aspect: "9:16"
clips:
  - file: "rough_cut_32sotki.mp4"
    in: 0.0
    out: 95.73
intro:
  file: "analog.MOV"
  in: 0.0
  out: 4.0
voiceover:
  file: "audio/voiceover_dmitry.mp3"
captions:
  style: "karaoke"
  source: "whisper"
endcard:
  image: "territory.jpeg"
  duration: 5
  points:
    - "32 сотки в престижном районе Алматы"
    - "Выход к реке Есентай"
    - "Все центральные коммуникации"
    - "Высокий инвестиционный потенциал"
branding: null
```

Обратить внимание: `voiceover` — это `{file: "..."}` в один уровень вложенности
(см. схему в Task 2 — `raw["voiceover"]["file"]"`), не глубже.

- [ ] **Step 2: Скопировать этот же файл как пример в скилл**

```bash
cp "C:/Users/1/Desktop/Cloud/projects/32 sotki/shotlist.yaml" "C:/Users/1/.claude/skills/realestate-video-pipeline/examples/shotlist.example.yaml"
```

- [ ] **Step 3: Проверить, что shotlist.py грузит реальный файл без ошибок**

```bash
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" -c "
import sys; sys.path.insert(0, r'C:\Users\1\.claude\skills\realestate-video-pipeline\scripts')
from shotlist import load_shotlist
s = load_shotlist(r'C:\Users\1\Desktop\Cloud\projects\32 sotki\shotlist.yaml')
print(s.title, len(s.clips), s.intro, s.voiceover)
"
```

Ожидается вывод без исключений, `s.voiceover == "audio/voiceover_dmitry.mp3"`.

- [ ] **Step 4: Закоммитить shotlist.yaml в репозиторий Cloud**

```bash
cd "C:/Users/1/Desktop/Cloud"
git add "projects/32 sotki/shotlist.yaml"
git commit -m "feat(32 sotki): добавить shotlist.yaml для видео-пайплайна"
```

---

### Task 6: `build_ffmpeg.py` — быстрая автоматическая сборка

**Files:**
- Create: `C:\Users\1\.claude\skills\realestate-video-pipeline\scripts\build_ffmpeg.py`

**Interfaces:**
- Consumes: `load_shotlist`, `Shotlist` (Task 2); `build_karaoke_ass`, `WordTiming`
  (Task 3); `transcribe_words` (Task 4).
- Производит: CLI `python build_ffmpeg.py <shotlist.yaml>` → пишет
  `<base_dir>/final_cut.mp4`.

- [ ] **Step 1: Реализовать build_ffmpeg.py**

```python
# scripts/build_ffmpeg.py
from __future__ import annotations

import argparse
import os
import subprocess

import imageio_ffmpeg

from shotlist import load_shotlist, Shotlist
from transcribe import transcribe_words
from captions import build_karaoke_ass

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def run(cmd: list) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {' '.join(cmd)}\n{result.stderr[-4000:]}")


def build_intro(shotlist: Shotlist, out_path: str) -> float:
    clip = shotlist.intro
    duration = clip.out_sec - clip.in_sec
    src = shotlist.resolve(clip.file)
    run([
        FFMPEG, "-y", "-ss", str(clip.in_sec), "-t", str(duration), "-i", src,
        "-f", "lavfi", "-t", str(duration), "-i", "anullsrc=r=48000:cl=stereo",
        "-map", "0:v", "-map", "1:a",
        "-vf", f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
               f"fade=t=in:st=0:d=0.5,fade=t=out:st={duration - 0.5}:d=0.5,fps=30,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        out_path,
    ])
    return duration


def build_clips_concat(shotlist: Shotlist, out_path: str) -> float:
    filter_parts = []
    inputs = []
    total = 0.0
    for i, clip in enumerate(shotlist.clips):
        src = shotlist.resolve(clip.file)
        inputs += ["-i", src]
        dur = clip.out_sec - clip.in_sec
        total += dur
        filter_parts.append(
            f"[{i}:v]trim=start={clip.in_sec}:end={clip.out_sec},setpts=PTS-STARTPTS,"
            f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p[v{i}]"
        )
    concat_inputs = "".join(f"[v{i}]" for i in range(len(shotlist.clips)))
    filter_complex = ";".join(filter_parts) + f";{concat_inputs}concat=n={len(shotlist.clips)}:v=1:a=0[v]"

    run([
        FFMPEG, "-y", *inputs,
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        out_path,
    ])
    return total


def mux_voiceover_and_captions(video_path: str, shotlist: Shotlist, ass_path: str, out_path: str) -> None:
    voiceover_src = shotlist.resolve(shotlist.voiceover)
    ass_escaped = ass_path.replace("\\", "/").replace(":", "\\:")
    run([
        FFMPEG, "-y", "-i", video_path, "-i", voiceover_src,
        "-vf", f"ass='{ass_escaped}',eq=contrast=1.05:saturation=1.15",
        "-map", "0:v", "-map", "1:a",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-shortest",
        out_path,
    ])


def build_endcard(shotlist: Shotlist, out_path: str) -> float:
    duration = shotlist.endcard.duration
    image_src = shotlist.resolve(shotlist.endcard.image)
    text_file = os.path.join(os.path.dirname(out_path), "_endcard_text.txt")
    with open(text_file, "w", encoding="utf-8") as f:
        f.write("\n".join(shotlist.endcard.points))
    text_file_esc = text_file.replace("\\", "/").replace(":", "\\:")

    run([
        FFMPEG, "-y", "-loop", "1", "-t", str(duration), "-i", image_src,
        "-f", "lavfi", "-t", str(duration), "-i", "anullsrc=r=48000:cl=stereo",
        "-filter_complex",
        f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=20[bg];"
        f"[0:v]scale=1000:-1[fg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2-120[base];"
        f"[base]drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf':textfile='{text_file_esc}':"
        f"fontcolor=white:fontsize=42:line_spacing=22:x=(w-text_w)/2:y=h-460:box=1:boxcolor=black@0.45:boxborderw=20[txt];"
        f"[txt]fade=t=in:st=0:d=0.5,fade=t=out:st={duration - 0.5}:d=0.5[v]",
        "-map", "[v]", "-map", "1:a",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        out_path,
    ])
    return duration


def concat_final(segments: list, out_path: str) -> None:
    inputs = []
    filter_parts = []
    for i, seg in enumerate(segments):
        inputs += ["-i", seg]
        filter_parts.append(f"[{i}:v]fps=30,setpts=PTS-STARTPTS[v{i}];[{i}:a]asetpts=PTS-STARTPTS[a{i}]")
    concat_inputs = "".join(f"[v{i}][a{i}]" for i in range(len(segments)))
    filter_complex = ";".join(filter_parts) + f";{concat_inputs}concat=n={len(segments)}:v=1:a=1[v][a]"

    run([
        FFMPEG, "-y", *inputs,
        "-filter_complex", filter_complex,
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        out_path,
    ])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("shotlist_path")
    parser.add_argument("--work-dir", default=None)
    args = parser.parse_args()

    shotlist = load_shotlist(args.shotlist_path)
    work_dir = args.work_dir or os.path.join(shotlist.base_dir, "_build")
    os.makedirs(work_dir, exist_ok=True)

    intro_path = os.path.join(work_dir, "intro.mp4")
    clips_path = os.path.join(work_dir, "clips.mp4")
    main_path = os.path.join(work_dir, "main.mp4")
    endcard_path = os.path.join(work_dir, "endcard.mp4")
    ass_path = os.path.join(work_dir, "captions.ass")
    final_path = os.path.join(shotlist.base_dir, "final_cut.mp4")

    segments = []
    if shotlist.intro:
        build_intro(shotlist, intro_path)
        segments.append(intro_path)

    build_clips_concat(shotlist, clips_path)

    if shotlist.captions.style == "karaoke" and shotlist.captions.source == "whisper":
        words = transcribe_words(shotlist.resolve(shotlist.voiceover))
        build_karaoke_ass(words, ass_path)
        mux_voiceover_and_captions(clips_path, shotlist, ass_path, main_path)
    else:
        raise NotImplementedError(
            f"captions.style={shotlist.captions.style!r} source={shotlist.captions.source!r} не поддержаны"
        )
    segments.append(main_path)

    build_endcard(shotlist, endcard_path)
    segments.append(endcard_path)

    concat_final(segments, final_path)
    print(f"Готово: {final_path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Прогнать на реальном проекте 32 sotki**

```bash
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" \
  "C:/Users/1/.claude/skills/realestate-video-pipeline/scripts/build_ffmpeg.py" \
  "C:/Users/1/Desktop/Cloud/projects/32 sotki/shotlist.yaml"
```

Ожидается: печатает `Готово: C:\Users\1\Desktop\Cloud\projects\32 sotki\final_cut.mp4`
без исключений. Занимает несколько минут (транскрипция + рендер).

- [ ] **Step 3: Проверить результат ffprobe и сравнить с уже существующим ручным `final_cut_32sotki.mp4`**

```bash
FF="C:/Users/1/AppData/Local/Programs/Python/Python312/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
"$FF" -i "C:/Users/1/Desktop/Cloud/projects/32 sotki/final_cut.mp4" 2>&1 | grep -E "Duration|Stream"
```

Ожидается: `Duration` в районе 1:44 (4с интро + ~95.7с основной части + 5с
титульного экрана), видео 1080x1920, аудио aac 48000 stereo — как у
`final_cut_32sotki.mp4` из прошлой сессии, но с karaoke-субтитрами вместо
фразовых.

---

### Task 7: `build_capcut_draft.py` — программная сборка черновика CapCut

**Files:**
- Create: `C:\Users\1\.claude\skills\realestate-video-pipeline\scripts\build_capcut_draft.py`

**Interfaces:**
- Consumes: `load_shotlist`, `Shotlist` (Task 2).
- Производит: CLI `python build_capcut_draft.py <shotlist.yaml> [--draft-name NAME]`
  → создаёт папку черновика под `%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft\<NAME>`.

- [ ] **Step 1: Реализовать build_capcut_draft.py**

```python
# scripts/build_capcut_draft.py
from __future__ import annotations

import argparse
import os

import pyJianYingDraft as draft
from pyJianYingDraft import trange

from shotlist import load_shotlist, Shotlist

CAPCUT_DRAFT_ROOT = os.path.expandvars(
    r"%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft"
)


def build_draft(shotlist: Shotlist, draft_name: str, draft_root: str = CAPCUT_DRAFT_ROOT) -> str:
    folder = draft.DraftFolder(draft_root)
    script = folder.create_draft(draft_name, 1080, 1920, fps=30, allow_replace=True)

    video_track = script.append_track(draft.TrackSpec(draft.TrackType.video, "main"))
    audio_track = script.append_track(draft.TrackSpec(draft.TrackType.audio, "voiceover"))
    text_track = script.append_track(draft.TrackSpec(draft.TrackType.text, "endcard"))

    cursor_us = 0
    all_clips = ([shotlist.intro] if shotlist.intro else []) + shotlist.clips

    for clip in all_clips:
        duration_sec = clip.out_sec - clip.in_sec
        source_range = trange(f"{clip.in_sec}s", f"{duration_sec}s")
        target_range = trange(f"{cursor_us / draft.SEC}s", f"{duration_sec}s")
        segment = draft.VideoSegment(
            shotlist.resolve(clip.file),
            target_range,
            source_timerange=source_range,
        )
        segment.add_transition(draft.TransitionType.叠化, duration="0.5s")
        script.add_segment(segment, video_track)
        cursor_us += int(duration_sec * draft.SEC)

    total_clips_duration_sec = cursor_us / draft.SEC
    intro_duration_sec = (shotlist.intro.out_sec - shotlist.intro.in_sec) if shotlist.intro else 0.0
    voiceover_duration_sec = total_clips_duration_sec - intro_duration_sec

    voiceover_segment = draft.AudioSegment(
        shotlist.resolve(shotlist.voiceover),
        trange(f"{intro_duration_sec}s", f"{voiceover_duration_sec}s"),
    )
    script.add_segment(voiceover_segment, audio_track)

    endcard_start_sec = total_clips_duration_sec
    endcard_image_segment = draft.VideoSegment(
        shotlist.resolve(shotlist.endcard.image),
        trange(f"{endcard_start_sec}s", f"{shotlist.endcard.duration}s"),
    )
    script.add_segment(endcard_image_segment, video_track)

    for i, point in enumerate(shotlist.endcard.points):
        text_segment = draft.TextSegment(
            point,
            trange(f"{endcard_start_sec}s", f"{shotlist.endcard.duration}s"),
            style=draft.TextStyle(size=8.0, color=(1.0, 1.0, 1.0), align=1),
            clip_settings=draft.ClipSettings(transform_y=-0.3 + i * 0.15),
        )
        script.add_segment(text_segment, text_track)

    script.save()
    return os.path.join(draft_root, draft_name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("shotlist_path")
    parser.add_argument("--draft-name", default=None)
    args = parser.parse_args()

    shotlist = load_shotlist(args.shotlist_path)
    draft_name = args.draft_name or shotlist.title
    path = build_draft(shotlist, draft_name)
    print(f"Черновик CapCut создан: {path}")
    print("Откройте CapCut — проект должен появиться в списке.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Прогнать на реальном проекте 32 sotki**

```bash
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" \
  "C:/Users/1/.claude/skills/realestate-video-pipeline/scripts/build_capcut_draft.py" \
  "C:/Users/1/Desktop/Cloud/projects/32 sotki/shotlist.yaml" --draft-name "32 sotki test"
```

Ожидается: печатает `Черновик CapCut создан: ...\32 sotki test` без исключений.

- [ ] **Step 3: Проверить, что черновик реально записан на диск**

```bash
python -c "
import json, os
draft_dir = os.path.expandvars(r'%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft\32 sotki test')
content_path = os.path.join(draft_dir, 'draft_content.json')
assert os.path.exists(content_path), f'{content_path} не найден'
with open(content_path, encoding='utf-8') as f:
    data = json.load(f)
print('Файл валиден, верхнеуровневые ключи:', list(data.keys())[:10])
"
```

Ожидается: файл существует, валиден как JSON. Если ключи верхнего уровня не
совпадут с ожиданиями (`tracks`/`materials`) — это нормально, реальную схему
черновика фиксирует сама библиотека; главное на этом шаге — файл существует и
парсится как JSON.

- [ ] **Step 4: Открыть CapCut и визуально проверить черновик**

Открыть приложение CapCut на этой машине → на главном экране должен появиться
проект «32 sotki test» → открыть его → на таймлайне должны быть: клип intro,
клип rough_cut, картинка territory.jpeg в конце, аудиодорожка с озвучкой,
текстовые слои с 4 пунктами объявления в конце таймлайна. Это ручная проверка
(GUI), автоматизировать её не пытаемся (см. Global Constraints).

---

### Task 8: SKILL.md + документация + финальный коммит

**Files:**
- Create: `C:\Users\1\.claude\skills\realestate-video-pipeline\SKILL.md`
- Modify: `C:\Users\1\Desktop\Cloud\projects\32 sotki\README.md`

- [ ] **Step 1: Написать SKILL.md**

```markdown
---
name: realestate-video-pipeline
description: Use when producing a vertical (9:16) marketing video for a real estate listing (land plot, house, apartment) from drone/handheld footage + voiceover. Assembles either a fully automatic ffmpeg cut with karaoke-style captions, or a pre-built CapCut draft ready to open and finish with CapCut's premium tools (music library, auto-captions, filters, color grade). Triggers on requests like "смонтируй ролик объекта", "собери видео участка", "рекламный ролик недвижимости".
---

# Пайплайн продакшна видео по недвижимости

Спека: `docs/superpowers/specs/2026-07-10-real-estate-video-pipeline-design.md`
в репозитории `C:\Users\1\Desktop\Cloud`.

## Когда использовать
Нужно собрать рекламный вертикальный ролик объекта недвижимости из отснятого
материала (дрон/ручная камера) + закадровой озвучки + ключевых пунктов
объявления.

## Подготовка окружения (один раз)

```bash
python -m venv "C:/Users/1/.claude/skills/realestate-video-pipeline/.venv"
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" -m pip install -r "C:/Users/1/.claude/skills/realestate-video-pipeline/requirements.txt"
```

## Конфиг проекта: `shotlist.yaml`

Кладётся в папку конкретного проекта (`projects/{slug}/shotlist.yaml`), см.
`examples/shotlist.example.yaml` в этом скилле для полного примера. Схема:

- `title` — название ролика.
- `aspect` — зарезервировано на будущее, сейчас всегда 9:16 (1080x1920).
- `clips` — список `{file, in, out}` в порядке появления в ролике (пути
  относительно папки проекта).
- `intro` (опционально) — то же самое, отдельный вступительный клип.
- `voiceover.file` — путь к аудио с закадровым текстом.
- `captions.style`/`captions.source` — сейчас поддерживается только
  `karaoke`/`whisper` (пословные субтитры через faster-whisper).
- `endcard.image`, `endcard.duration`, `endcard.points` — титульный экран в
  конце с фото и списком ключевых пунктов.
- `branding` — зарезервировано, сейчас всегда `null` (брендинга нет).

## Дорожка 1: быстрая автоматическая (ffmpeg)

```bash
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" \
  "C:/Users/1/.claude/skills/realestate-video-pipeline/scripts/build_ffmpeg.py" \
  "<путь к shotlist.yaml проекта>"
```

Результат — `final_cut.mp4` рядом с `shotlist.yaml`. Полностью автоматически,
без участия человека.

## Дорожка 2: черновик CapCut (премиальная полировка)

```bash
"C:/Users/1/.claude/skills/realestate-video-pipeline/.venv/Scripts/python.exe" \
  "C:/Users/1/.claude/skills/realestate-video-pipeline/scripts/build_capcut_draft.py" \
  "<путь к shotlist.yaml проекта>" --draft-name "<имя проекта>"
```

После этого открыть CapCut — черновик появится в списке проектов с уже
расставленными клипами/текстом/таймингом. Музыку из библиотеки CapCut,
авто-субтитры с анимацией, фильтры и цветокоррекцию, а также сам экспорт —
доделать вручную в интерфейсе CapCut.

## Известные ограничения
- Автоклик по интерфейсу CapCut не реализован и не планируется — библиотека
  `pyJianYingDraft` умеет это только для китайского интерфейса JianYing.
- `in`/`out` по клипам проставляются вручную в `shotlist.yaml` — автоподбор
  лучших дублей не реализован.
- Только формат 9:16.
- `pyJianYingDraft` — сторонняя библиотека, версия зафиксирована в
  `requirements.txt`; при обновлении CapCut формат черновика может измениться.
  Дорожка 1 (ffmpeg) не зависит от CapCut и остаётся рабочей в любом случае.
```

- [ ] **Step 2: Обновить README.md проекта 32 sotki**

Добавить в раздел «Функции» файла
`C:\Users\1\Desktop\Cloud\projects\32 sotki\README.md` пункт:

```markdown
- `shotlist.yaml` — конфиг для переиспользуемого пайплайна сборки видео
  (скилл `realestate-video-pipeline`) — описывает клипы/озвучку/титульный
  экран этого ролика, можно пересобрать через `build_ffmpeg.py` или
  `build_capcut_draft.py`.
```

- [ ] **Step 3: Закоммитить README**

```bash
cd "C:/Users/1/Desktop/Cloud"
git add "projects/32 sotki/README.md"
git commit -m "docs(32 sotki): упомянуть shotlist.yaml и видео-пайплайн в README"
```

---

## Self-Review Notes

- Спека покрыта: конфиг (Task 2, 5), ffmpeg-дорожка (Task 6), CapCut-дорожка
  (Task 7), документация (Task 8), риски описаны в Global Constraints и
  SKILL.md.
- Имена функций/классов согласованы между задачами: `load_shotlist`/`Shotlist`/
  `ShotlistError` (Task 2) используются как есть в Task 5-7; `WordTiming`/
  `build_karaoke_ass` (Task 3) используются как есть в Task 4, 6.
- Task 5 явно предупреждает про опечатку с вложенностью `voiceover.file` —
  чтобы исполнитель не скопировал сломанный YAML буквально.
