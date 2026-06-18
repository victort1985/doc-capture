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
        lines = f.readlines()

    # Three forms seen in the wild for plugin-published Gradle files:
    #   Kotlin DSL:           compileSdk = 34
    #   Groovy, long form:    compileSdkVersion 34
    #   Groovy, short form:   compileSdk 34   (no '=', no 'Version' suffix —
    #                          this is the one file_picker 8.3.7 actually uses)
    # Line-by-line on purpose: an earlier version of this used \s+ across
    # the whole file content, which matches newlines too and silently ate
    # into the following line (e.g. turned "compileSdk = flutter.x\n\n
    # defaultConfig {" into a mangled single line) — anchoring each
    # substitution to one line at a time makes that class of bug
    # impossible.
    patterns = [
        re.compile(r"(compileSdkVersion\s*=\s*)\S+"),
        re.compile(r"(compileSdkVersion\s+)\S+"),
        re.compile(r"(compileSdk\s*=\s*)\S+"),
        re.compile(r"(compileSdk\s+)\S+"),
        re.compile(r"(targetSdkVersion\s*=\s*)\S+"),
        re.compile(r"(targetSdkVersion\s+)\S+"),
        re.compile(r"(targetSdk\s*=\s*)\S+"),
        re.compile(r"(targetSdk\s+)\S+"),
    ]

    changed = False
    new_lines = []
    for line in lines:
        new_line = line
        for pattern in patterns:
            if pattern.search(new_line):
                new_line = pattern.sub(rf"\g<1>{TARGET_SDK}", new_line, count=1)
                changed = True
                break  # a more specific/earlier pattern already matched —
                       # don't let a weaker later pattern (e.g. the bare
                       # "compileSdk <value>" form, which would otherwise
                       # also match the "=" in "compileSdk = 34" and
                       # corrupt the line) get a second look at this line
        new_lines.append(new_line)

    if not changed:
        return False

    with open(path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
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
