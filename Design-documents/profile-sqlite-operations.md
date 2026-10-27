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
   måste stämma innan atomärt namnbyte. Profil-ID:n, achievementdata och
   motståndarrelationer jämförs dessutom med deterministiska SHA-256-digests.
   Historiska relationer till en profil som inte längre finns bevaras; deras
   källprofil är fortfarande foreign-key-skyddad.
5. Kör `npm run profiles:verify` efter aktivering.

Om valideringen misslyckas raderas endast den nya temporära databasen. Den
aktiva målfilen och den skrivskyddade backupen lämnas orörda. Innan någon konto-
eller profilskrivning gjorts kan rollback göras med stoppad server genom att
flytta undan `profiles.sqlite` och återköra importen från manifestets backup.
Efter första konto-/profilskrivningen ska en verifierad SQLite-backup återställas
i stället; återgång till JSON är då förbjuden.

## Importrepetition 2026-10-27

En kopia av den verkliga `data/profiles.json` importerades med Node 24.22.1 till
en separat temporär katalog. Källfilen och repetitionskopian var båda 35 061
byte och hade SHA-256
`b072dfa754ddfb1d77e9b3df2d3f4e9f6eef7aa2215e6badef5cf1daaab28119`.
Produktionsfilen ändrades inte och ingen produktionsdatabas aktiverades.

Såväl importens inbyggda kontroll som en separat efterkontroll gav
`integrity_check = ok`, noll foreign-key-fel och identiska värden före och efter:

| Kontroll | Resultat |
| --- | ---: |
| Profiler | 13 |
| Poäng | 31 |
| Speltid (ms) | 11 281 600 |
| Kills / deaths | 7 / 28 |
| Matcher | 18 |
| Achievements | 86 |
| Motståndarrelationer | 7 |

Profil-ID-digesten var
`c64a39ee9ed6511c960794d033335ab95ee0b85bd0b19ea232dc27f61759b75e`,
achievement-digesten
`20400e7bb34350d430f8f382dcda5cb917427ca4bf1aeec29e093650a1b06dbd`
och relationsdigesten
`4e0abed8d7904a9f1752cbf3a44ab37fbd7cbe56f171e0346b5496fb0612dd0a`.
Det visar att identiteterna och datan, inte bara antalen, överensstämde.

## Slutimport 2026-10-27

Serverport 3000 var stängd före importen. Den verifierade källfilen
`data/profiles.json` (35 061 byte, SHA-256
`b072dfa754ddfb1d77e9b3df2d3f4e9f6eef7aa2215e6badef5cf1daaab28119`)
importerades med projektets låsta Node 24.22.1 till `data/profiles.sqlite`.

Importen skapade den skrivskyddade backupen
`data/backups/profiles-2026-10-27T14-14-55-162Z.json` och ett skrivskyddat
manifest. Backupens SHA-256 är identisk med källfilens. Importens kontroll och
en separat körning av `profiles:verify` gav båda `integrity_check = ok`, noll
foreign-key-fel och samma totalsummor och identitetsdigests som repetitionen
ovan. Produktionsdatabasen aktiverades först efter att importkontrollen hade
passerat.
