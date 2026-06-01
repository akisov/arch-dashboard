---
title: Arch Committee Dashboard
emoji: 🏛
colorFrom: indigo
colorTo: blue
sdk: docker
pinned: false
---

# 🏛 Arch Committee Dashboard

Дашборд для аналитики отсечек арх. комитета и технического архитектора по Story-задачам в Яндекс Трекере.

**Живой дашборд:** [akisov-arch-committee.hf.space](https://akisov-arch-committee.hf.space)

---

## Что делает

Отслеживает два типа отсечек по задачам типа **Story** в очередях `POOLING`, `DOSTAVKAPIKO`, `UDOSTAVKA`:

| Тип | Переход | Смысл |
|-----|---------|-------|
| **АрхКом** | Аналит. проработка готово → Ревью аналитики | Задача пришла к арх. комитету |
| **ТА** | Согласование архитектуры → На уточнении | Технический архитектор вернул задачу |

Точка входа — переход задачи в статус **«Аналитическая проработка готово»**: именно с этого момента задача считается поступившей к техархам.

---

## Стек

- **Backend:** Python · FastAPI · httpx
- **БД:** SQLite (персистентное хранилище HuggingFace `/data`)
- **Frontend:** Vanilla JS · SVG-графики (без зависимостей)
- **Deploy:** HuggingFace Spaces · Docker
- **Данные:** Яндекс Трекер API v2

---

## Архитектура

```
┌─────────────────────────────────┐
│     HuggingFace Space (Docker)  │
│                                 │
│  FastAPI                        │
│  ├── GET  /          → UI       │
│  ├── GET  /data      → из БД    │
│  ├── GET  /sync      → SSE синк │
│  └── GET  /sync-info → статус   │
│                                 │
│  SQLite (/data/tracker.db)      │
│  ├── tasks       (key, title…)  │
│  ├── transitions (все переходы) │
│  └── sync_log    (дата синка)   │
└─────────────────────────────────┘
         ↑ Яндекс Трекер API v2
```

---

## Как работает синхронизация

| Режим | Когда | Время |
|-------|-------|-------|
| **Полный синк** | Первый запуск или принудительно | 5–15 мин |
| **Инкрементальный** | Каждый день/неделю | 10–60 сек |

- **Полный синк** загружает историю за 2 года по всем трём очередям
- **Инкрементальный** подтягивает только задачи, обновлённые с момента последней синхронизации
- После синка данные в БД, фильтр периода работает мгновенно (чистый SQL)

---

## Локальный запуск

```bash
git clone https://github.com/akisov/arch-dashboard.git
cd arch-dashboard

# Установить зависимости
pip install fastapi uvicorn httpx

# Запустить
TRACKER_TOKEN=ваш_токен ORG_ID=ваш_org_id uvicorn main:app --port 8000
```

Открыть: `http://localhost:8000`

---

## Deploy на HuggingFace

Репо связано с HF Space. Любой `git push` в `main` автоматически пересобирает Docker-образ и деплоит.

```bash
# Запушить обновления в оба места
git push origin main   # → HuggingFace Space (автодеплой)
git push github main   # → GitHub
```

Секреты задаются в настройках Space:
- `TRACKER_TOKEN` — OAuth токен Яндекс Трекера
- `ORG_ID` — ID организации (по умолчанию `7405124`)

---

## Структура файлов

```
├── main.py          # FastAPI backend + SQLite логика
├── Dockerfile       # Docker-образ для HF Spaces
├── static/
│   └── index.html   # Фронтенд (всё в одном файле)
└── README.md
```
