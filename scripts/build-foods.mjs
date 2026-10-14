// Builds public/usda-foods.json from the USDA SR Legacy rows in tempo-food-db.
// Run: node scripts/build-foods.mjs
// Each row: [name, kcal, protein, carbs, fat] per 100 g.
import { readFileSync, writeFileSync } from 'node:fs'

const src = JSON.parse(readFileSync('node_modules/tempo-food-db/data/tempolife-foods.json', 'utf8'))
const r1 = (n) => Math.round((n ?? 0) * 10) / 10
const rows = src
  .filter((f) => f.source === 'usda_sr_legacy' && f.kcal_per_100g != null)
  .map((f) => [f.name, Math.round(f.kcal_per_100g), r1(f.protein_g), r1(f.carbs_g), r1(f.fat_g)])
  .sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1])
  // The source drops qualifiers like "with salt", leaving near-identical rows. Keep one per name + calories.
  .filter((row, i, all) => i === 0 || row[0] !== all[i - 1][0] || row[1] !== all[i - 1][1])

writeFileSync('public/usda-foods.json', JSON.stringify(rows))
console.log(`wrote ${rows.length} foods`)
