"""Adds the camera + location usage descriptions documented in
installation-guide.md (section 4.2) to a freshly `flutter create`d
Info.plist. Idempotent — safe to run on a plist that already has them.
"""

PATH = "ios/Runner/Info.plist"

ENTRIES = (
    "\t<key>NSCameraUsageDescription</key>\n"
    "\t<string>Camera access is needed to capture documents and photos.</string>\n"
    "\t<key>NSLocationWhenInUseUsageDescription</key>\n"
    "\t<string>Location is used to attach the call's location when you tap "
    '"get location".</string>\n'
)


def main() -> None:
    with open(PATH, encoding="utf-8") as f:
        content = f.read()

    if "NSCameraUsageDescription" in content:
        print("Usage descriptions already present, nothing to do.")
        return

    # Insert just before the final closing </dict></plist> pair.
    content = content.replace("</dict>\n</plist>", ENTRIES + "</dict>\n</plist>", 1)

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print("Added camera + location usage descriptions to Info.plist")


if __name__ == "__main__":
    main()
