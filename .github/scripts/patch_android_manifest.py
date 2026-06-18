"""Adds the camera + location permissions documented in
installation-guide.md (section 3.2) to a freshly `flutter create`d
AndroidManifest.xml. Idempotent — safe to run on a manifest that already
has them.
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

    if "android.permission.CAMERA" in content:
        print("Permissions already present, nothing to do.")
        return

    content = re.sub(r"(<manifest[^>]*>)", r"\1\n" + PERMISSIONS, content, count=1)

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print("Added camera + location permissions to AndroidManifest.xml")


if __name__ == "__main__":
    main()
