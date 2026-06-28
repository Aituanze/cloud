---
name: project-structure
description: Структура и правила проекта Cloud — папки, файлы, соглашения
metadata:
  type: project
---

- Корень проекта: C:\Users\1\Desktop\Cloud
- Каждый суб-проект живёт в: projects/{project-name}/
- Slug уникальный, URL-friendly, описательный
- Состав: index.html, JS, CSS, data/*.js (для const/generated контента)
- Каждый проект имеет README.md на русском (Title, Description, Features)
- Каждый проект уникален — не копировать с других

**Backlog:** BACKLOG.md в корне — SSOT задач.
Читать секции IN PROGRESS + TODO перед новой задачей.
При закрытии задачи → переместить в DONE с датой и evidence.

**Why:** Архитектура согласована в CLAUDE.md проекта.
**How to apply:** При создании любого нового проекта или файла.
