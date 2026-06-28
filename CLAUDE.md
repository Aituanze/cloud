# Project Guidelines

## Language
- Always answer in Russian.

## Workflow
- Отвечать на русском.
- Не задавать уточняющих вопросов до начала работы. Делать лучшие предположения из контекста.
- Если предположения значимые — кратко упомянуть после завершения задачи.
- Держать ответы короткими и action-oriented.
- Использовать git-коммиты как чекпойнты в многошаговых задачах.

## Project Structure
- Each project lives in projects/{project-name}/
- For each new project create a UNIQUE slug & name (project-name). It will be in the URL — make it URL-friendly and descriptive.
- Project contains: index.html, JS files, CSS files, JS data files.
- All const/generated content goes in {project-name}/data/ as .js files (e.g., data/questions.js).
- Each project has a README.md in Russian with: Title, Description, Features. Update it when adding new features.
- Each project is unique from scratch. Do not base it on other projects.

## Safety Rules
- Работать только внутри текущей папки проекта. Никогда не трогать файлы вне её.
- Перед разрушительными командами (rm, mv, chmod -R, массовые замены) — показать команду и спросить подтверждение.
- Использовать git для версионности. Предлагать бэкап перед рискованными операциями.

## Backlog
- SSOT (single source of truth) задач: BACKLOG.md в корне проекта.
- Перед любой новой задачей — прочитать BACKLOG.md (секции IN PROGRESS + TODO).
- При закрытии задачи — сразу переместить в DONE с датой и evidence.
