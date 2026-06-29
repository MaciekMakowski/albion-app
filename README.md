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

Serwer domyslnie dziala na `http://localhost:3000` i udostepnia endpoint `GET /api/health`.
