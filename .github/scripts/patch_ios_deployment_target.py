"""Sets the iOS deployment target to 15.0 in the freshly `flutter
create`d ios/Podfile — needed once firebase_core was added: CocoaPods
failed dependency resolution with "requires a higher minimum iOS
deployment version than your application is targeting... increase to
at least 15.0", since the default Flutter template either leaves the
`platform :ios` line commented out (auto-assigned to 13.0) or pins an
older version.

Idempotent — safe to run on a Podfile that's already been patched.
"""
import re

PATH = "ios/Podfile"
TARGET = "15.0"


def main() -> None:
    with open(PATH, encoding="utf-8") as f:
        content = f.read()

    # MULTILINE anchor + [ \t]* (not \s*, which would also match the
    # newline that ends the PRECEDING line) — found via direct testing
    # that \s* let the match start from that previous newline, so the
    # replacement (which doesn't re-add a newline) silently merged the
    # comment line above it into one line with no separator. Running
    # this script a second time reproduced it immediately.
    pattern = re.compile(r"^[ \t]*#?[ \t]*platform :ios, ['\"][\d.]+['\"]", re.MULTILINE)
    new_line = f"platform :ios, '{TARGET}'"

    if pattern.search(content):
        content, count = pattern.subn(new_line, content, count=1)
        with open(PATH, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Set iOS deployment target to {TARGET} in {PATH}")
    else:
        raise SystemExit(
            f"No 'platform :ios' line found in {PATH} — the generated "
            "Podfile's format has likely changed; update this script's "
            "pattern to match."
        )


if __name__ == "__main__":
    main()
