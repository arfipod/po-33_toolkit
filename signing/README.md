# Development signing only

`development.jks` is an intentionally public **development-only** signing key generated for this project. Alias: `po33-development`; store/key password: `android`.

It lets the APK delivered initially and subsequent CI builds update the same package without uninstalling local projects. It provides no private publisher identity: anyone can sign with it. Never use it for Play Store or a trusted production release. A future private production key requires migration to a different application ID or reinstall/export/import.
