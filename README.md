# Albion App Workspace

Repozytorium ma teraz strukturę z osobnym frontendem i backendem:

- `client` - aplikacja React + Vite
- `serwer` - serwer Node.js + Express

## Instalacja

```bash
cd "d:\\albion app"
npm install
npm install --prefix client
npm install --prefix serwer
```

## Uruchamianie (oba naraz)

```bash
npm run dev
```

## Uruchamianie osobno

```bash
npm run dev:client
npm run dev:serwer
```

## SSR i serwowanie frontendu przez Express

Po wykonaniu builda klienta serwer Express renderuje React po stronie serwera (SSR) i zwraca frontend dla tras innych niz `/api/*`.

Build:

```bash
npm run build
```

Start serwera produkcyjnego:

```bash
npm run start
```

W trybie dev pozostaje rozdzielony workflow (`dev:client` + `dev:serwer`).

## Docker (caly stack: app + monitoring)

Repo zawiera kompletna docker yzacje aplikacji: SSR app (Express + React) + Prometheus + Grafana.

### 1. Przygotuj pliki `.env`

Backend:

```bash
cp serwer/.env.docker.example serwer/.env
```

Monitoring:

```bash
cp monitoring/.env.example monitoring/.env
```

Na Windows PowerShell:

```powershell
Copy-Item serwer/.env.docker.example serwer/.env
Copy-Item monitoring/.env.example monitoring/.env
```

### 2. Build i start kontenerow

```bash
docker compose --env-file monitoring/.env up -d --build
```

Lub przez skrypt npm:

```bash
npm run docker:up
```

Skrypt `docker:up` korzysta z `monitoring/.env` (zalecane do deployu).
Do szybkiego testu na wartosciach przykladowych mozesz uzyc:

```bash
npm run docker:up:example
```

### 3. Dostep po uruchomieniu

- Aplikacja (SSR): http://localhost:3000
- Health: http://localhost:3000/api/health
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001

### 4. Operacje

```bash
npm run docker:ps
npm run docker:logs
npm run docker:down
```

### 5. Deploy na wlasny serwer

1. Wgraj repo na serwer (lub `git clone`).
2. Utworz `serwer/.env` i `monitoring/.env` z plikow example.
3. Ustaw poprawne `CORS_ALLOWED_ORIGINS` (Twoja domena).
4. Zmien domyslne haslo Grafany.
5. Uruchom: `docker compose --env-file monitoring/.env up -d --build`.
6. Wystaw ruch przez reverse proxy (np. Nginx/Caddy) i HTTPS.

Kontenery maja `restart: unless-stopped`, wiec po restarcie hosta uruchomia sie automatycznie.

Serwer domyslnie dziala na `http://localhost:3000` i udostepnia endpoint `GET /api/health`.
Dodatkowo endpoint `GET /api/metrics` zwraca podstawowe metryki runtime (requesty, statusy, latency).
Endpoint `GET /api/metrics/prometheus` zwraca metryki w formacie Prometheus.

## Monitoring

Gotowa konfiguracja Prometheus + Grafana znajduje sie w [monitoring/README.md](monitoring/README.md).

Skrypty z root projektu:

```bash
npm run monitoring:up
npm run monitoring:down
npm run monitoring:restart
npm run monitoring:logs
npm run monitoring:ps
```

Tryb developerski z automatycznym startem monitoringu:

```bash
npm run dev:with-monitoring
```

## Security i hardening (serwer)

Konfiguracja znajduje sie w [serwer/.env.example](serwer/.env.example).

Najwazniejsze zmienne:

- `CORS_ALLOWED_ORIGINS` - lista dozwolonych originow frontendu.
- `TRUST_PROXY` - konfiguracja pracy za reverse proxy.
- `ENABLE_HTTPS_REDIRECT` - wymuszenie przekierowania na HTTPS.
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` - limity zapytan.
- `ALBION_API_TIMEOUT_MS`, `ALBION_API_RETRY_COUNT`, `ALBION_API_RETRY_BASE_DELAY_MS` - timeout i retry dla zewnetrznego API.

Skrypty pomocnicze dla zaleznosci serwera:

```bash
npm run audit --prefix serwer
npm run audit:prod --prefix serwer
npm run deps:outdated --prefix serwer
```
