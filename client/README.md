# Albion Recipe Simulator (Client)

Frontend React + Vite do symulacji craftingu i podgladu cen z Albion Online Data API.

Run:

```bash
cd "d:\albion app\client"
npm install
npm run dev
```

Usage:

- Add 1-5 ingredients. For each: set item id/name (for reference), required per craft, available quantity and buy price per unit.
- Set output item id (example: `T4_BAG`), salvage percent and region.
- Click `Simulate` to estimate produced outputs and fetch prices per city. Profit is revenue minus total material costs.
