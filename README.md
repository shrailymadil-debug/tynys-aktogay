# «Тыныс»: эквивалент 131 МВт ВЭС в архивном расчёте

При ВЭС 300 + СЭС 500 МВт координатор достигает CO₂, для которого V0 требуется
≈431 МВт ВЭС по интерполяции (450 МВт по сетке). Разница выпуска Cu <0,1%.
**Это результат прежней модели.** Пересчёт с GeoMet и ремонтами не подтверждает
эквивалент при сопоставимом выпуске: снижение CO₂ сопровождается потерей Cu.
Формула, свежие числа и ограничения: [MODULES_V4.md](team/tynys/MODULES_V4.md).

Цифровой двойник реального медного рудника **Актогай** (KAZ Minerals, обл. Абай) на OpenEgiz. Рудник берёт из сети ≈ 230 МВт, а энергия Казахстана на 66 % угольная. Двойник помогает решить:

- **руководству** — сравнить строительство ВЭС/СЭС и управление при сопоставимом выпуске меди;
- **энергетику и диспетчеру** — каждый час: какую руду и как тонко молоть, когда заряжать электросамосвалы и накопитель, чтобы не выбрасывать энергию ветра и солнца;
- **по запросу энергосистемы** — выдержит ли рудник снижение лимита сети и чего это будет стоить завтра.

Масштаб модели задан по отчёту KAZ Minerals 2024, погода — реальная (Open‑Meteo ERA5, 2024). GeoMet — открытый геологический аналог, не скважины Актогая. Подробно — [SUBMISSION.md](SUBMISSION.md).

## Запуск (Ubuntu 24.04, Docker)

```bash
sudo apt-get update && sudo apt-get install -y make
make tynys
```

`make tynys` поднимает платформу OpenEgiz (`make up`), собирает и запускает рудник (двойники, модель рудника, координатор, лабораторию «Два будущих», экран, дашборд) и в конце выполняет проверку `SMOKE OK`. Первый запуск — около 10–15 минут (скачивание образов). Данные скачивать не нужно: все параметры в репозитории.

Новый запуск модели начинается в **09:00** выбранного дня. `TYNYS_START_HOUR=0 make tynys` возвращает старт в полночь. V0/V1/V2 получают одинаковое начальное состояние и погоду; итоги считаются с часа старта. Один модельный час ≈ 6 секунд.

## Что открыть — обход за 5 минут

**Быстрый путь: «Демо за 3 минуты» на пульте.** Штиль → живой 3D с остановленными
лопастями и окраской уступов GeoMet → настоящий расчёт «Двух будущих».
При завершении удаляется только событие демо. Результат может потребовать больше
трёх минут на медленной машине; промежуточные цифры не подменяются.

1. **Пульт рудника:** http://localhost:8095 — главные цифры сейчас, схема рудника, режим «вдох/выдох» и объяснение «почему так», план на 24 ч, сравнение «как сейчас / правила / Тыныс». Справа: цель «медь / CO₂», кнопки **«Что если…»** (штиль, авария линии, запрос KEGOC, твёрдая руда, план +10 %, отказ накопителя) с отменой, «Сколько строить ВЭС и СЭС».
2. **3D‑сцена:** http://localhost:8095/3d.html — кнопка «История: проблема → решение» облетает рудник; переключатель «Как сейчас / С „Тыныс“»; щелчок по оборудованию показывает числа из двойника; включённые сценарии видны на оборудовании.
3. **Два будущих:** http://localhost:8095/futures.html — «Проверить обещание»: один и тот же снимок рудника, обычное управление и «Тыныс» рядом, последствия и восстановление. Порядок — [team/tynys/FUTURES.md](team/tynys/FUTURES.md).
4. **Grafana:** адрес и пароль печатает `make up`; Dashboards → OpenEgiz Examples → «Тыныс · Актогай».
5. **Ditto:** двойники `kz.tynys:*`.

Дополнительно: [Unity‑проект](team/tynys/unity/README.md) — редактируемая сцена для Unity 6000.3.2f1 (не входит в запуск по README). Как проверялся стенд — [team/tynys/TESTING.md](team/tynys/TESTING.md).

Остановить: `make down`. Удалить всё: `make clean`.

## Repository contents

| Path | Contents |
|---|---|
| `team/tynys/` | Рудник «Тыныс»: модель (`tynys/`), сервисы (`services/`), экран (`ui/`), дашборд (`grafana/`), `compose.yml` |
| `SUBMISSION.md` | Description of the Submission: **required** |
| `presentation.pdf` | Presentation: **required**, in the repository root |
| `AGENTS.md`, `CLAUDE.md` | Instructions for your AI agents (Codex, Claude Code and others read them automatically) |
| `examples/mine/` | The Example Mine: shows how a digital mine is built on OpenEgiz. It is not a basis for the Submission |
| `OPENEGIZ.md`, `OPENEGIZ.ru.md` | Documentation of the OpenEgiz platform v1.0.4 |

The Submission is the `main` branch at the moment of the Freeze; other branches are not evaluated.

## License

The Submission is distributed under the MIT license, see [LICENSE](LICENSE). Copyright belongs to the Team: add the line `Copyright (c) 2026 <Team members>` to `LICENSE`.

---

Platform: [aleka07/openegiz](https://github.com/aleka07/openegiz). If the platform was useful to you, support the project with a star on GitHub.
