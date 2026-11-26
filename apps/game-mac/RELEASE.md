# Releasing a game for other Macs

M6 W7 (AB-T-0648, decision AB-D-0297 item 6). `scripts/build.sh` makes a game's Mac app ready for Developer ID: it is
sandboxed, has the hardened runtime on, links only system libraries, and asks for no entitlement beyond the sandbox's
and the loopback server's. The build signs it ad hoc, so it runs only on the Mac that built it. Signing it with a
Developer ID, notarising it and handing it out are the operator's steps. They need the operator's Apple Developer
account, and nothing in this repository does them.

`scripts/release.sh` runs those steps, and the checks after each one.

## What the build already is

| | |
|---|---|
| Hardened runtime | On (`codesign --options runtime`), checked by `release.sh --check` from `codesign -d`'s flags |
| Entitlements | `com.apple.security.app-sandbox`, `network.client`, `network.server` (`Config/VRMXGGame.entitlements`). The shell serves the game on a loopback port, and the page fetches from it. There's no JIT or unsigned-memory exception: WebKit's own processes carry theirs. No camera, microphone, files or `get-task-allow` |
| Libraries | System only (`otool -L`): one Swift executable, no frameworks, no helpers. The web content is sealed as resources |
| Notices | The game's build carries `THIRD-PARTY-LICENCES.txt`, and Help › Third-Party Notices opens it (shell 0.15.0) |
| Bundle identifier | `com.xocialize.vrmxg-game.<game id>`, from the build's manifest. Change the prefix in `Config/Info.plist` if the games go out under another name. Developer ID doesn't tie it to a team |
| Version | The game's `release` (`game.json`), else 1.0 |

Check an app as it is:

```sh
apps/game-mac/scripts/build.sh apps/game-mac/build/rush
apps/game-mac/scripts/release.sh --check apps/game-mac/build/morning-rush.app
```

## The operator's steps

**Once:**

1. You need a **Developer ID Application** certificate in your login keychain (Xcode › Settings › Accounts › Manage
   Certificates, or developer.apple.com). `security find-identity -v -p codesigning` lists it as
   `Developer ID Application: <name> (<team id>)`.
2. Store notary credentials in the keychain under a profile name:
   `xcrun notarytool store-credentials <profile> --apple-id <apple id> --team-id <team id>`. It asks for an
   app-specific password from account.apple.com. An App Store Connect API key (`--key`, `--key-id`, `--issuer`) works
   too.

**For each release:**

```sh
apps/game-mac/scripts/build.sh apps/game-mac/build/rush               # the app, ad hoc, hardened
apps/game-mac/scripts/release.sh --identity "Developer ID Application: <name> (<team id>)" \
  --notarize --keychain-profile <profile> apps/game-mac/build/morning-rush.app
```

`release.sh` does the following:

1. It clears extended attributes and signs with your identity, the hardened runtime, a secure timestamp and the
   entitlements.
2. It runs the checks: `codesign --verify --deep --strict`, the runtime flag, exactly the three entitlements, system
   libraries only, and the notices present.
3. It zips the app (`ditto -c -k --keepParent`), submits it with `xcrun notarytool submit … --wait`, and staples the
   ticket (`xcrun stapler staple`, then `stapler validate`).
4. It checks Gatekeeper accepts the app (`spctl --assess --type execute`).
5. It zips the stapled app as `build/morning-rush-<version>.zip`, ready to hand out.

Without `--notarize` it stops after step 2. If notarisation is refused, `xcrun notarytool log <submission id>
--keychain-profile <profile>` says why.

**Then:** open the zip on another Mac, or on a new user account. The first launch should give no Gatekeeper warning, and
the game should play from the title menu to an ending.

## What was checked here, and what wasn't

- **Checked (M6 W7, 2026-11-25):** the ad hoc, hardened build of the Morning Rush (build 74e5ba13, runtime
  vrmxg-game 0.1.0+70fc2a6f92e0, shell 0.15.0) passes `codesign --verify --deep --strict` and `release.sh --check`
  (`flags=0x10002(adhoc,runtime)`), and `release.sh --check` refuses a copy signed without the hardened runtime. Under
  the GPU lock, AppProbe ran `HAND-TEST-M5-RUSH`'s scenario on that app, 4 of 4: the title on WebGPU, New Game into
  the level, lost on the clock, and won from Slot 1. Slot 1 was made from the session `acceptance/m6/sharing.mjs`
  recorded. Help › Third-Party Notices opened the build's notices in the shell's window
  ([`docs/hand-test/results/m6-w7-hardened/`](docs/hand-test/results/m6-w7-hardened/report.md)).
- **Not checked:** a Developer ID signature, notarisation, stapling and Gatekeeper on another Mac. Those need the
  operator's identity. Gamepads in the sandboxed, hardened app weren't checked either: no real pad was tried, and that
  is AB-T-0642. If a pad turns out to need an entitlement, add only that one, and the entitlement check in `release.sh`
  with it.
