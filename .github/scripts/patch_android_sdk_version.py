"""Bumps compileSdk (and targetSdk, same constraint) in the freshly
`flutter create`d android/app/build.gradle.kts to 36.

Background: the generated file defaults to `compileSdk =
flutter.compileSdkVersion`, which resolves to whatever the currently
installed Flutter SDK build considers its default (34, as of the
`stable` channel build used in CI at the time this was written) — but
some plugins (file_picker, via flutter_plugin_android_lifecycle) publish
AAR metadata requiring consumers to compile against API 36+. Hardcoding
the literal number sidesteps the SDK's own (currently lower) default.
"""

PATH = "android/app/build.gradle.kts"
TARGET_SDK = 36


def main() -> None:
    with open(PATH, encoding="utf-8") as f:
        content = f.read()

    original = content
    content = content.replace(
        "compileSdk = flutter.compileSdkVersion",
        f"compileSdk = {TARGET_SDK}",
    )
    content = content.replace(
        "targetSdk = flutter.targetSdkVersion",
        f"targetSdk = {TARGET_SDK}",
    )

    if content == original:
        print("No matching compileSdk/targetSdk lines found — nothing changed (check the template hasn't changed format).")
        return

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Pinned compileSdk/targetSdk to {TARGET_SDK} in {PATH}")


if __name__ == "__main__":
    main()
