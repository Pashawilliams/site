# tools

## issue-cert.sh — HTTPS-сертифікат для кастомного домену

GitHub Pages **не приймає завантажений сертифікат**: він сам замовляє безкоштовний
сертифікат у Let's Encrypt для домену з файлу `CNAME`. Тому «випустити сертифікат» =
привести DNS до правильного стану + переприкріпити домен, щоб GitHub повторив
ACME-перевірку, і потім увімкнути Enforce HTTPS.

Скрипт робить це за один запуск:

```bash
gh auth login                 # обліковий запис власника репозиторію
./tools/issue-cert.sh         # перевірка DNS → перезапуск замовлення → очікування → Enforce HTTPS
./tools/issue-cert.sh --status   # лише поточний стан
./tools/issue-cert.sh --no-retry # тільки дочекатися, без переприкріплення домену
```

Потрібно: `gh`, `dig`, `openssl`. Токен — класичний scope `repo`.

## cert.workflow.yml — те саме через GitHub Actions

Якщо не хочеться робити це з локальної машини: скопіюйте файл у
`.github/workflows/cert.yml` (через веб-інтерфейс GitHub: Add file → Create new file),
закомітьте — і запускайте з вкладки **Actions → HTTPS certificate → Run workflow**.
Він використовує наявний секрет `GH_PAT`, нічого додатково налаштовувати не треба.
