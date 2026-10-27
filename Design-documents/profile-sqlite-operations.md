# SQLite-import och drift

Profilservern använder `data/profiles.sqlite`. Alla synkrona SQLite-anrop körs i
`sqlite-profile-worker.js`; spellopen lämnar absoluta snapshots till en kö som
slår ihop väntande snapshots. Högst en skrivning och en senaste väntande
snapshot hålls. Eftersom varje skrivning ersätter databasens profiltillstånd i
en transaktion kan en omskrivning inte dubbelregistrera räknare.

## Förlustbudget och fel

Pågående speltid checkpointas var 30:e sekund (`VVC_AUTOSAVE_MS`, lägst 100 ms).
Vid hård krasch får därför högst ett checkpointintervall av pågående speltid
och poäng gå förlorat. Redan köad statistik kan gå förlorad vid process- eller
maskinkrasch, men kön töms vid SIGINT/SIGTERM. En misslyckad transaktion
återförs och provas om efter 50 respektive 200 ms. Efter tre misslyckanden
sparas felet i könsstatus, loggas vid kontrollerad avstängning och ger exitkod
1. Nya snapshots ersätter fortfarande bara äldre väntande snapshots och
ordningen bryts inte. Om databasen inte kan öppnas startar inte spelservern.

## Slutlig import

1. Stoppa servern och kontrollera att ingen process skriver `profiles.json`.
2. Kör `npm run profiles:import`. Verktyget vägrar skriva över en befintlig
   `profiles.sqlite`.
3. Verktyget skapar en tidsstämplad skrivskyddad JSON-backup och manifest med
   SHA-256, byteantal och totalsummor.
4. Import sker till en ny temporär databas. `integrity_check`,
   `foreign_key_check`, profilantal, poäng, speltid, kills, deaths, matcher,
   achievements och motståndarrelationer (inklusive ursprungliga motståndar-ID:n)
   måste stämma innan atomärt namnbyte. Historiska relationer till en profil som
   inte längre finns bevaras; deras källprofil är fortfarande foreign-key-skyddad.
5. Kör `npm run profiles:verify` efter aktivering.

Om valideringen misslyckas raderas endast den nya temporära databasen. Den
aktiva målfilen och den skrivskyddade backupen lämnas orörda. Innan någon konto-
eller profilskrivning gjorts kan rollback göras med stoppad server genom att
flytta undan `profiles.sqlite` och återköra importen från manifestets backup.
Efter första konto-/profilskrivningen ska en verifierad SQLite-backup återställas
i stället; återgång till JSON är då förbjuden.
