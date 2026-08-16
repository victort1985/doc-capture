"""Adds required permissions to a freshly `flutter create`d
AndroidManifest.xml for VixorTK. Idempotent — safe to run on a
manifest that already has them.

Deliberately a SEPARATE, narrower script from the main app's own
patch_android_manifest.py, not because VixorTK's networking needs
differ (they don't — see below), but because that script ALSO adds
CAMERA/ACCESS_FINE_LOCATION/ACCESS_COARSE_LOCATION/POST_NOTIFICATIONS,
none of which VixorTK's pubspec.yaml pulls in a dependency for (no
image_picker/mobile_scanner, no geolocator, no firebase_messaging) —
requesting permissions an app has no code path that ever uses is bad
practice regardless of whether it would "work" harmlessly.

INTERNET is the critical one, confirmed as the ACTUAL root cause of a
real, reported connection failure: VixorTK's first release could
launch and run fully on iOS with a given .vxconn connection file, but
the identical file failed on Android with "DNS lookup errno 7" /
"DNS over HTTPS fallback errno 1" / repeated DNS retry failures —
symptoms that look network/DNS-specific but aren't. This exact
failure signature (and its real cause) was already independently
documented in the main app's own version of this script: `flutter
create` does NOT add the INTERNET permission by default on the
Flutter version in use here, and without it, Android blocks ALL
network access for the app at the OS level uniformly — every
connection attempt, including a raw socket to a literal IP address,
fails, which surfaces as exactly the DNS-lookup-shaped errors
reported, because the app's own DNS/HTTP code never even gets a
chance to run correctly regardless of how it's written. iOS has no
equivalent manifest-permission gate for basic internet access, which
is exactly why the same connection file worked there while failing on
Android specifically. This was missed when VixorTK's own CI workflow
was first built: this permission-patching script was bundled together
with the main app's OWN camera/location additions in one file, and
skipping the WHOLE script (since VixorTK genuinely doesn't need
camera/location) accidentally also skipped the internet permission,
which VixorTK absolutely does need — a real, shipped bug in the
release users actually downloaded, not a hypothetical.

Also enables cleartext (plain http) traffic for the same reason as the
main app: VixorTK's own connection-settings screen supports a "direct
address" mode (LAN IP, no TLS cert on the server) via the exact same
settings_service.dart copied from the main app, and Android blocks
plaintext HTTP for apps by default since API 28 regardless of what the
app's own code does — the server address is chosen at runtime from
whatever .vxconn file gets imported, so there's no way to know ahead
of build time whether it'll need plain http or https, hence allowing
both rather than guessing.
"""
import re

PATH = "android/app/src/main/AndroidManifest.xml"

PERMISSIONS = (
    '    <uses-permission android:name="android.permission.INTERNET" />\n'
)


def main() -> None:
    with open(PATH, encoding="utf-8") as f:
        content = f.read()

    changed = False

    if "android.permission.INTERNET" not in content:
        content = re.sub(r"(<manifest[^>]*>)", r"\1\n" + PERMISSIONS, content, count=1)
        changed = True
        print("Added INTERNET permission to AndroidManifest.xml")
    else:
        print("INTERNET permission already present, nothing to do.")

    if "android:usesCleartextTraffic" not in content:
        content = re.sub(
            r"(<application\b)",
            r'\1\n        android:usesCleartextTraffic="true"',
            content,
            count=1,
        )
        changed = True
        print("Enabled usesCleartextTraffic on <application>")
    else:
        print("usesCleartextTraffic already present, nothing to do.")

    if changed:
        with open(PATH, "w", encoding="utf-8") as f:
            f.write(content)


if __name__ == "__main__":
    main()
