# Admin panel operations

The admin panel is available at `http://SERVER-IP:PORT/admin` (and the alias
`/adminpanel`). The HTML, scripts,
API and every mutation are checked server-side against the authenticated
account's `admin` role. New accounts always receive the `player` role.

## Grant the first admin role

Use the bootstrap environment variable for one controlled start. The account
must already exist, and the value is the account's displayed player name.

```powershell
$env:VVC_BOOTSTRAP_ADMIN = 'Your player name'
.\Start.bat
```

Confirm that the server logs `Bootstrap admin enabled`, sign in, and open
`/admin`. Stop that instance and remove the variable before the normal service
start:

```powershell
Remove-Item Env:VVC_BOOTSTRAP_ADMIN
```

Do not leave the bootstrap variable in the permanent production service
configuration. After the first admin exists, grant or remove roles from the
panel. The final admin cannot demote or delete itself.

## Production deployment

1. Back up `data/profiles.sqlite` and its `-wal`/`-shm` files using the existing
   live patch checklist.
2. Deploy the code and restart the service. Schema version 3 adds `role`,
   `force_password_change`, and the admin audit log automatically.
3. Bootstrap the first admin as described above, then restart without the
   variable.
4. Verify `/admin` as both an admin and an ordinary player.

Admin-created accounts and admin password resets return a random temporary
password once. At the next sign-in, the player must choose a permanent password
and receives a fresh set of recovery codes. Password resets and role demotions
revoke active sessions.

Statistics can be reset one counter at a time or all at once. A player-level
reset is rejected while that player is actively in a match. Global Team Cleo
and Team Viking wins can be reset independently.
