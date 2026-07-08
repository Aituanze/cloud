# Промпт: изометрические диорамы районов для карты agnt.24

Контекст: владелец не любит цветные пузыри-сферы на главной карте, хочет
район = узнаваемая достопримечательность (аналог референса
`inbox/Images for site/First page.png`). API-ключа для генерации нет —
используется бесплатный Pollinations.ai (см. скилл `free-ai-image-gen`).

## Единый стиль (STYLE-суффикс, не менять между районами)

```
isometric 3D miniature diorama, tilt-shift photography style, soft cinematic
daylight, light pastel colors, clean very light gray background, professional
3D render, highly detailed, small pine trees and streets around, no text, no
watermark, no logo
```

## Промпты по районам (id → описание сцены)

| id | Район | Достопримечательность | Промпт-описание |
|---|---|---|---|
| medeu | Медеуский | ТВ-башня + каток Медеу | Almaty TV tower needle and Medeu ice skating rink stadium, snow-capped Zailiysky Alatau mountains behind, pine forest |
| bostandyk | Бостандыкский | ТРЦ MEGA | modern MEGA shopping mall glass building with big parking, faint snow mountains far in background, park trees |
| almaly | Алмалинский | ЦУМ + Арбат | historic ЦУМ department store building and Arbat pedestrian street with lanterns and outdoor cafes, dense old city center, no mountains |
| zhetysu | Жетысуский | ЖД-вокзал Алматы-2 | Almaty-2 historic railway train station with turquoise dome, trains on platform, small square with fountain |
| turksib | Турксибский | Аэропорт Алматы | Almaty international airport terminal building with an airplane, wide open flat land, big sky, no mountains |
| nauryzbay | Наурызбайский | Акимат | government akimat building with blue dome and Kazakhstan flag, wide new avenues, young trees |
| auezov | Ауэзовский | Алматинский цирк | round Almaty circus building with striped dome, surrounded by soviet apartment blocks |
| alatau | Алатауский | Новостройки + мечеть | brand new residential high-rise towers and a large mosque with tall minaret, construction cranes in distance, wide new roads |
| talgar | Талгарский | Halyk Arena | Halyk Arena modern indoor sports arena with curved silver roof, large parking lot, green steppe and village houses around |

## Команда генерации

```
https://image.pollinations.ai/prompt/{urlencode(desc + ", " + STYLE)}?width=768&height=768&nologo=true&model=flux&seed={N}
```

Скрипт-раннер: `C:\Users\1\AppData\Local\Temp\claude\...\scratchpad\gen_district_images.py`
(временный, при желании перенести в `projects/agnt-24-app/data/` как
постоянный инструмент, если понадобится перегенерировать/добавить район).

Результат сохранён в `projects/agnt-24-app/images/districts/{id}.jpg`.

## Заметка о выборе достопримечательностей

Ауэзовский/Алатауский — не в исходном референсе владельца (там было только
6 из 8 городских районов), landmark подобраны самостоятельно по общей
узнаваемости (цирк, новостройки+мечеть), не по строгой геопривязке "здание
X юридически находится в границах района Y". Если владелец укажет другой
landmark для этих двух районов — перегенерировать тем же рецептом.
