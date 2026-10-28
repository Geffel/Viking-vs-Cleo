# Checklista – patchning av live-server

Använd denna på live-servern. Ersätt inte eller radera live-serverns `data`-mapp
vid en vanlig kodpatch.

## Före underhållsfönstret

- [ ] Läs igenom ändringarna och avgör om patchen innehåller databas- eller
  profiländringar.
- [ ] Starta `Start.bat` en gång efter patchen medan internet är tillgängligt.
  Den hämtar automatiskt den privata Node.js 24.22.1-körmiljön till `.runtime/`
  vid behov och installerar låsta beroenden. Den ändrar inte datorns vanliga
  Node-installation.
- [ ] Bekräfta var live-datakatalogen finns. Normalt är den `data`; om
  `VVC_DATA_DIR` används måste samma katalog anges i kommandona nedan.
- [ ] Ta en kopia av hela live-datakatalogen till en separat, säker plats.
- [ ] Vid första SQLite-flytten: repetera importen mot en kopia av
  `profiles.json` på utvecklingsmaskinen först.

## Stoppa live-servern

- [ ] Informera spelare om underhåll och stoppa nya spel.
- [ ] Stoppa servern kontrollerat via dess vanliga service-/startscript.
- [ ] Kontrollera att serverprocessen är helt avslutad och att porten inte
  längre lyssnar.

## Lägg in patchen

- [ ] Kopiera in den nya serverkoden enligt normal patchrutin.
- [ ] Behåll den befintliga `data`-mappen och dess innehåll.
- [ ] `Start.bat` installerar automatiskt beroenden om `package-lock.json` har
  ändrats och validerar körmiljön. Avsluta sedan servern igen inför importen.

## Endast första gången: flytta profiler till SQLite

- [ ] Kontrollera att `data/profiles.json` finns och att `data/profiles.sqlite`
  **inte** redan finns.
- [ ] Kör följande från projektroten medan servern fortfarande är stoppad:

  ```powershell
  . .\tools\local-node-runtime.ps1
  $runtime = Initialize-VvcRuntime -ProjectRoot $PWD.Path
  & $runtime.Node .\tools\import-profiles.mjs import
  & $runtime.Node .\tools\import-profiles.mjs verify
  ```

- [ ] Läs resultatet: import och separat verifiering måste vara godkända.
- [ ] Kontrollera att `data/profiles.sqlite` samt JSON-backup och manifest i
  `data/backups` har skapats.
- [ ] Låt gamla `profiles.json` ligga kvar som historisk källa/extra backup.

Importverktyget vägrar medvetet att skriva över en befintlig SQLite-databas.
Avbryt och undersök om kommandot rapporterar fel; försök inte radera databasen
för att köra om importen mot live-data.

## Starta och verifiera

- [ ] Starta live-servern med den vanliga rutinen.
- [ ] Kontrollera serverloggen: inga SQLite-, profil- eller konto-fel får finnas.
- [ ] Logga in med ett testkonto och kontrollera profil, leaderboard och en
  enkel spelrunda.
- [ ] Verifiera att ny statistik (t.ex. match eller kill) visas efter att
  profilen laddats om.
- [ ] Bekräfta att externa spelare kan ansluta.

## Efter en lyckad SQLite-drift

- [ ] Skapa och spara en verifierad SQLite-backup efter större driftpass eller
  före framtida riskfyllda patchar. I ett nytt PowerShell-fönster, initiera först
  spelets privata körmiljö:

  ```powershell
  . .\tools\local-node-runtime.ps1
  $runtime = Initialize-VvcRuntime -ProjectRoot $PWD.Path
  & $runtime.Node .\tools\import-profiles.mjs backup
  ```

- [ ] Kopiera `data/backups` till en separat maskin eller annan säker lagring.
- [ ] Notera patchversion, tidpunkt och backupfil i driftloggen.

## Återställning

- [ ] Stoppa servern först.
- [ ] Om SQLite redan har tagit emot nya data: återställ från en verifierad
  SQLite-backup, inte från `profiles.json`.
- [ ] Flytta undan den aktiva `profiles.sqlite` samt eventuella `-wal` och
  `-shm`-filer till en karantänmapp; radera dem inte direkt.
- [ ] Återställ med en uttryckligen vald backup och verifiera:

  ```powershell
  . .\tools\local-node-runtime.ps1
  $runtime = Initialize-VvcRuntime -ProjectRoot $PWD.Path
  & $runtime.Node .\tools\import-profiles.mjs restore data/backups/profiles-YYYY-MM-DDTHH-MM-SS-fffZ.sqlite data/profiles.sqlite
  & $runtime.Node .\tools\import-profiles.mjs verify
  ```

- [ ] Starta inte servern om verifieringen misslyckas.

## Vanlig patch efter SQLite-flytten

För framtida kodpatchar är flödet enkelt: stoppa servern, ta backup, uppdatera
kod utan att röra `data`, starta och gör en kort funktionstest. Kör inte
`profiles:import` igen.
