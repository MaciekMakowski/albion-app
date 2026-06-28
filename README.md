# Albion Recipe Simulator

Simple React app that simulates iterative crafting with salvage and fetches output item prices from the Albion Online Data API.

Run:

```bash
cd "d:\albion app"
npm install
npm run dev
```

Usage:
- Add 1–5 ingredients. For each: set item id/name (for reference), required per craft, available quantity and buy price per unit.
- Set output item id (example: `T4_BAG`), salvage percent and region.
- Click `Simulate` to estimate produced outputs and fetch prices per city. Profit is revenue minus total material costs.
