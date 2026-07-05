"""Adds the aps-environment (push notifications) entitlement to the
freshly `flutter create`d iOS project's Runner.entitlements file.

This declares the capability in the built .app/.ipa — whether it
actually grants real push depends on the provisioning profile used to
sign it having a matching App ID with Push Notifications enabled (see
mobile-client's push-notifications setup notes). Our own CI build is
unsigned (see the 'Patch Xcode project — disable code signing' step),
so this is a best-effort declaration for whatever signs the IPA
afterward, not a guarantee.
"""

import plistlib

ENTITLEMENTS_PATH = "ios/Runner/Runner.entitlements"


def main() -> None:
    try:
        with open(ENTITLEMENTS_PATH, "rb") as f:
            plist = plistlib.load(f)
    except FileNotFoundError:
        plist = {}

    if plist.get("aps-environment") == "development":
        print(f"{ENTITLEMENTS_PATH} already has aps-environment, nothing to do.")
        return

    plist["aps-environment"] = "development"

    with open(ENTITLEMENTS_PATH, "wb") as f:
        plistlib.dump(plist, f)
    print(f"Added aps-environment=development to {ENTITLEMENTS_PATH}")


if __name__ == "__main__":
    main()
