# Суперкрошки: «Тыныс» — дышащий рудник Актогай на OpenEgiz

Цифровой двойник реального медного рудника **Актогай** (KAZ Minerals, обл. Абай). Рудник «дышит» вместе с ветром и солнцем: когда энергии много — мелет твёрдую руду и заряжает электросамосвалы («вдох»), когда мало — мелет мягкую, копит твёрдую на складе и ездит на заряде («выдох»). Решения каждый час принимает координатор с прогнозом на 24 ч. Подробно — [SUBMISSION.md](SUBMISSION.md).

## Запуск (Ubuntu 24.04, Docker)

```bash
sudo apt-get install -y make
make tynys
```

`make tynys` поднимает платформу OpenEgiz (`make up`), собирает и запускает рудник (двойники, модель рудника, координатор, экран, дашборд) и в конце выполняет проверку `SMOKE OK`. Первый запуск — около 10–15 минут (скачивание образов). Данные скачивать не нужно: все параметры в репозитории.

## Что открыть

- **Экран рудника:** http://localhost:8095 — схема рудника, режим «вдох/выдох», «почему так», план на 24 ч, сравнение V0/V1/V2, кнопки «Что если…».
- **3D‑сцена рудника:** http://localhost:8095/3d.html — карьер уступами, самосвалы на спиральной дороге и зарядке, склады, мельницы, ВЭС, СЭС, накопитель, ЛЭП KEGOC и потоки энергии; кнопка «Экскурсия». Всё на живых данных из двойников.
- **Grafana:** адрес и пароль печатает `make up`; Dashboards → OpenEgiz Examples → «Тыныс · Актогай».
- **Ditto:** двойники `kz.tynys:*`.

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
