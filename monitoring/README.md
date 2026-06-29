# Monitoring (Prometheus + Grafana)

Ten folder zawiera gotowy stack monitoringu dla aplikacji:

- Prometheus
- Grafana

## Wymagania

1. Docker / Docker Compose.
2. Plik `serwer/.env` (dla aplikacji).
3. Plik `monitoring/.env` (dla Grafany).

## Konfiguracja

Skopiuj plik przykladowy i ustaw bezpieczne haslo Grafany:

```bash
cp .env.example .env
```

Na Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## Start

Uruchom z katalogu `monitoring`:

```bash
docker compose up -d
```

Lub z root projektu:

```bash
npm run monitoring:up
```

Uwaga: skrypty `monitoring:*` uruchamiane z root projektu domyslnie korzystaja z `monitoring/.env.example`.
Do produkcji uzyj wlasnego pliku `monitoring/.env` i komendy deploy opisanej nizej.

## Pelny stack w jednym compose (zalecane)

W root projektu jest `docker-compose.yml`, ktory uruchamia:

- app (Express + SSR frontend)
- prometheus
- grafana

Start:

```bash
docker compose --env-file monitoring/.env up -d --build
```

Lub:

```bash
npm run docker:up
```

Skrypt `docker:up` korzysta z `monitoring/.env`.
Do szybkiego uruchomienia na danych przykladowych mozesz uzyc:

```bash
npm run docker:up:example
```

## Dostep

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001
  - login: `admin`
  - haslo: `admin`

## Metryki aplikacji

Prometheus scrapuje endpoint backendu:

- `http://app:3000/api/metrics/prometheus`

Jesli zmienisz nazwe serwisu lub port, zaktualizuj target w [monitoring/prometheus/prometheus.yml](monitoring/prometheus/prometheus.yml).

## Dashboard

Dashboard jest provisionowany automatycznie:

- `Albion App Overview`

## Zatrzymanie

```bash
docker compose down
```

Lub z root projektu:

```bash
npm run monitoring:down
```

## Auto-start po restarcie hosta

Kontenery maja ustawione `restart: unless-stopped`, wiec po restarcie hosta uruchomia sie automatycznie (o ile Docker startuje przy starcie systemu).

## Instrukcja deployu (serwer)

1. Wgraj repo na serwer.
2. Utworz `serwer/.env` i `monitoring/.env` na podstawie plikow example.
3. Ustaw bezpieczne haslo Grafany i poprawne `CORS_ALLOWED_ORIGINS`.
4. Uruchom pelny stack:

```bash
docker compose --env-file monitoring/.env up -d --build
```

5. Zweryfikuj status:

```bash
docker compose --env-file monitoring/.env ps
```

6. (Opcjonalnie) Podepnij reverse proxy i HTTPS dla Grafany oraz Prometheusa.
