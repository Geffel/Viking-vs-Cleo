# Baslinje för profilskrivning och ticktid

Mätningen gjordes 2026-10-27 innan SQLite-workern och skrivkön implementeras.
Syftet är att ge storyn "SQLite-schema, skrivkö och verifierbar import" en
repeterbar före-mätning.

## Metod

Kör:

```powershell
npm run measure:ticks
```

Benchmarken värmer upp i 1 000 tick och mäter sedan 30 000 tick med åtta
spelare i aktiv närstrid och 16 syntetiska profiler. Den kör dels strid och
statistikaggregering utan skrivning, dels samma last med den nuvarande
synkrona, atomiska omskrivningen av hela `profiles.json` när en berörd profil
ändras. Mätningen använder samma `Game`, `ProfileStatistics`,
`JsonProfileStore` och `TickMetrics` som servern.

Detta är ett lokalt, syntetiskt regressionsprov, inte en kapacitetsgaranti för
produktionsservern. Samma kommando och last ska köras på produktionsmaskinen
före driftsättning.

## Resultat

- Runtime: Node.js 24.22.1, Windows x64.
- CPU: 12th Gen Intel Core i7-12700F, 20 logiska CPU:er.
- Strid utan profilskrivning: p95 **0,037 ms**, p99 **0,067 ms**, längsta paus
  **1,508 ms**.
- Strid med synkron profilskrivning: p95 **0,758 ms**, p99 **1,285 ms**, längsta
  paus **78,579 ms**.
- Scenariot med skrivning gjorde 5 475 fullständiga profilomskrivningar under
  30 000 tick.

Resultatet visar varför skrivvägen måste flyttas från spellopen: normalfallen
är relativt korta, men en enskild synkron filoperation kan blockera många
16,67-ms-tick i rad. Eftermätningen ska använda samma benchmark med SQLite-kön
aktiverad och redovisa p95, p99 och längsta paus sida vid sida.

## Införda gränser

- `JsonProfileStore` äger filformat och atomisk filersättning. Den är medvetet
  synkron tills den ersatts av lagringsworkern i nästa story.
- `ProfileStatistics` äger statistikmutationer och kan testas utan HTTP,
  WebSocket eller databas. Varje operation returnerar mängden berörda profiler.
- Achievement-utvärdering efter spelhändelser körs bara för de berörda
  profilerna.
- `TickMetrics` mäter den verkliga serverloopens arbetstid och skriver p95, p99
  och max till serverloggen vid kontrollerad avstängning.
