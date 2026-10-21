# Суперкрошки: «Тыныс» — дышащий рудник Актогай на OpenEgiz

Цифровой двойник реального медного рудника **Актогай** (KAZ Minerals, обл. Абай). Рудник «дышит» вместе с ветром и солнцем: когда энергии много — мелет твёрдую руду и заряжает электросамосвалы («вдох»), когда мало — мелет мягкую, копит твёрдую на складе и ездит на заряде («выдох»). Решения каждый час принимает координатор с прогнозом на 24 ч. Подробно — [SUBMISSION.md](SUBMISSION.md).

## Запуск (Ubuntu 24.04, Docker)

```bash
sudo apt-get install -y make
make tynys
```

`make tynys` поднимает платформу OpenEgiz (`make up`), собирает и запускает рудник (двойники, модель рудника, координатор, экран, дашборд) и в конце выполняет проверку `SMOKE OK`. Первый запуск — около 10–15 минут (скачивание образов). Данные скачивать не нужно: все параметры в репозитории.

Новый запуск модели начинается в **09:00** выбранного дня. `TYNYS_START_HOUR=0 make tynys` возвращает старт в полночь; `START_DOY` в сервисе задаёт день года, а не час. V0/V1/V2 получают одинаковое начальное состояние и погоду; накопленные итоги считаются только с часа старта.

## Что открыть

- **Два будущих рудника:** http://localhost:8095/futures.html — проверить снижение лимита сети, сравнить обычное управление и «Тыныс» из одного снимка, увидеть восстановление и исследовать предел при штиле, отказе накопителя и твёрдой руде. Порядок демонстрации — [team/tynys/FUTURES.md](team/tynys/FUTURES.md).
- **Экран рудника:** http://localhost:8095 — схема рудника, режим «вдох/выдох», «почему так», план на 24 ч, сравнение V0/V1/V2, кнопки «Что если…».
- **3D‑сцена рудника:** http://localhost:8095/3d.html — карьер, дороги, самосвалы, фабрика и энергосистема. Нажмите на оборудование или его подпись, чтобы увидеть числа из двойника. Шкалы показывают заполнение складов и заряд; активные сценарии видны на оборудовании и в баннере с отменой. Внизу справа — слайдер освещения и кнопка «По времени модели»; при открытии выбран свет 09:00. Слайдер меняет только свет, модельное время и расчёты продолжаются независимо.
- **Unity-проект:** [team/tynys/unity](team/tynys/unity/README.md) — редактируемая сцена для Unity 6000.3.2f1, автономное демо и просмотр данных Ditto; инструкция запуска и управления внутри.
- **Grafana:** адрес и пароль печатает `make up`; Dashboards → OpenEgiz Examples → «Тыныс · Актогай».
- **Ditto:** двойники `kz.tynys:*`.

Остановить: `make down`. Удалить всё: `make clean`.

Для проверки 3D без аппаратной видеокарты: установите `playwright==1.64.0`, выполните `python -m playwright install --with-deps chromium`, затем `python team/tynys/scripts/check3d.py http://localhost:8095/3d.html scene.png --expect-source live`. Проверка сохраняет дневной и ночной кадры, сценарии и JSON с реальными FPS, draw calls и именем рендерера. Для современного Chromium используется ANGLE + SwiftShader, причём программный рендерер проверяется через WebGL. LOW использует pixel ratio 0.9, объединённую геометрию и контактные пятна вместо карт теней. Частота ограничена примерно 15 FPS, чтобы не перегружать CPU; порог проверки — 10 FPS, результат зависит от процессора. `CHROME_PATH` позволяет выбрать установленный Chrome.

CI разделяет две нагрузки: `validate` проверяет работу с живым Ditto (`--mode functional --expect-source live`) и записывает наблюдаемый FPS; `scene-performance` запускает ту же сцену с `trace.json` на отдельной машине без Docker (`--mode performance --expect-source replay`) и требует медиану не ниже 10 FPS. В функциональном отчёте явно указано, достигнут ли этот порог; успешные проверки функций сами по себе не означают достаточную скорость. Обычный запуск без `--mode` проверяет и функции, и FPS. В отчётах сохранены источник данных, версия Chromium, CPU, commit SHA и хеш записи.

Локальный замер 21.10.2026: Windows, 24 логических CPU, Chrome 149 / SwiftShader, окно 1400×850. На одном снимке 09:00 вызовы отрисовки сократились с 456 до 106, pixel ratio вырос с 0.6 до 0.9; обе версии держали около 15 FPS. На живом стенде итоговая версия дала медиану и p10 15 FPS за 10 секунд. Дополнительный замер на фиксированном снимке с ограничением всех процессов браузера до 8 логических CPU дал 14.96 FPS в среднем за 12 секунд, до 2 CPU — около 8 FPS. Ограничение касалось браузера, а не всей машины со стендом; результат не заменяет проверку на оборудовании судьи.

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
