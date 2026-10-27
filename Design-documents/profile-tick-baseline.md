# Baslinje för profilskrivning och ticktid

Före- och eftermätningen gjordes 2026-10-27. Syftet är att ge storyn
"SQLite-schema, skrivkö och verifierbar import" en repeterbar jämförelse.

## Metod

Kör:

```powershell
npm run measure:ticks
```

Benchmarken värmer upp i 1 000 tick och mäter sedan 30 000 tick med åtta
spelare i aktiv närstrid och 16 syntetiska profiler. Den kör dels strid och
statistikaggregering utan skrivning, dels samma last med profilskrivning.
Föremätningen använde synkron atomisk omskrivning av hela `profiles.json`.
Eftermätningen använder serverns `SqliteProfileStore`, worker och sammanslagna
skrivkö. Mätningen använder samma `Game`, `ProfileStatistics` och `TickMetrics`
som servern.

Detta är ett lokalt, syntetiskt regressionsprov, inte en kapacitetsgaranti för
produktionsservern. Samma kommando och last ska köras på produktionsmaskinen
före driftsättning.

## Resultat

- Runtime: Node.js 24.22.1, Windows x64.
- CPU: 12th Gen Intel Core i7-12700F, 20 logiska CPU:er.
- Före, strid utan profilskrivning: p95 **0,037 ms**, p99 **0,067 ms**, längsta
  paus **1,508 ms**.
- Före, synkron JSON-skrivning: p95 **0,758 ms**, p99 **1,285 ms**, längsta paus
  **78,579 ms**.
- Efter, strid utan profilskrivning: p95 **0,038 ms**, p99 **0,070 ms**, längsta
  paus **1,097 ms**.
- Efter, köad SQLite-skrivning: p95 **0,038 ms**, p99 **0,066 ms**, längsta paus
  **1,180 ms**.
- Båda skrivscenarierna tog emot 5 475 snapshots under 30 000 tick. SQLite-kön
  behåller högst en pågående och en senaste väntande snapshot.

Eftermätningen visar att diskoperationerna inte längre syns som långa pauser på
spellopen. Den längsta uppmätta pausen föll från 78,579 ms till 1,180 ms och
p95/p99 ligger i nivå med scenariot utan lagring.

## Införda gränser

- `SqliteProfileStore` lämnar snapshots till en avgränsad worker. Synkrona
  SQLite-operationer körs bara där och kontrollerad avstängning tömmer kön.
- `ProfileStatistics` äger statistikmutationer och kan testas utan HTTP,
  WebSocket eller databas. Varje operation returnerar mängden berörda profiler.
- Achievement-utvärdering efter spelhändelser körs bara för de berörda
  profilerna.
- `TickMetrics` mäter den verkliga serverloopens arbetstid och skriver p95, p99
  och max till serverloggen vid kontrollerad avstängning.
