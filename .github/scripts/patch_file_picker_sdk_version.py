"""Patches file_picker's own Android Gradle module (in the pub cache, not
in our repo) to compile against API 36.

Background: ':file_picker is currently compiled against android-34' is
a SEPARATE Gradle subproject from our app — bumping our own
android/app/build.gradle.kts (patch_android_sdk_version.py) does nothing
for it. The currently pinned file_picker version (see pubspec.yaml)
predates file_picker's own fix for this (pub.dev/packages/file_picker
changelog, issue #1842, fixed in 10.3.7 by switching to
flutter.compileSdkVersion) — and even that fix only helps once the
installed Flutter SDK's own default compileSdk is >= 36, which isn't
guaranteed across CI runs. Patching the pub-cache copy directly sidesteps
both the file_picker version and the Flutter SDK's own default value.

Handles both Groovy (build.gradle) and Kotlin DSL (build.gradle.kts),
since older plugin versions may still ship the Groovy form.
"""
import glob
import os
import re

TARGET_SDK = 36


def patch_file(path: str) -> bool:
    with open(path, encoding="utf-8") as f:
        content = f.read()
    original = content

    # Kotlin DSL: compileSdk = <something>
    content = re.sub(r"compileSdk\s*=\s*\S+", f"compileSdk = {TARGET_SDK}", content)
    # Groovy DSL: compileSdkVersion <something> (no '=')
    content = re.sub(
        r"compileSdkVersion\s+\S+", f"compileSdkVersion {TARGET_SDK}", content
    )

    if content == original:
        return False

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return True


def main() -> None:
    pub_cache = os.environ.get("PUB_CACHE", os.path.expanduser("~/.pub-cache"))
    candidates = glob.glob(
        os.path.join(pub_cache, "hosted", "pub.dev", "file_picker-*", "android", "build.gradle*")
    )
    if not candidates:
        print(f"No file_picker android/build.gradle* found under {pub_cache} — nothing to patch.")
        return

    for path in candidates:
        changed = patch_file(path)
        print(f"{'Patched' if changed else 'No matching compileSdk line in'}: {path}")


if __name__ == "__main__":
    main()
