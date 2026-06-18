"""Adds the camera + location permissions documented in
installation-guide.md (section 3.2) to a freshly `flutter create`d
AndroidManifest.xml. Idempotent — safe to run on a manifest that already
has them.

Also enables cleartext (plain http) traffic. Real-world testing found
the app's connection-settings "direct address" mode (LAN IP, no TLS
cert configured on the server — see server/src/main.ts) failed
silently with a misleading error: Android blocks plaintext HTTP for
apps by default since API 28, while a phone's browser is unaffected by
that restriction — which is exactly why curl/browser could reach the
server fine but the app couldn't. Since the server address is now
chosen at runtime (not baked in at build time), there's no way to know
ahead of time whether it'll be plain LAN http or a domain behind https,
so this allows both rather than guessing.
"""
import re

PATH = "android/app/src/main/AndroidManifest.xml"

PERMISSIONS = (
    '    <uses-permission android:name="android.permission.CAMERA" />\n'
    '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n'
    '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n'
)


def main() -> None:
    with open(PATH, encoding="utf-8") as f:
        content = f.read()

    changed = False

    if "android.permission.CAMERA" not in content:
        content = re.sub(r"(<manifest[^>]*>)", r"\1\n" + PERMISSIONS, content, count=1)
        changed = True
        print("Added camera + location permissions to AndroidManifest.xml")
    else:
        print("Permissions already present, nothing to do.")

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
