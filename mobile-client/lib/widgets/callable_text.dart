import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Opens the phone's own dialer with [phone] pre-filled — does not place
/// the call itself (no CALL_PHONE permission needed), matches spec item 6
/// ("функция позвонить, набор номера через стандартную программу").
Future<void> launchDialer(String phone) async {
  final uri = Uri(scheme: 'tel', path: phone.trim());
  await launchUrl(uri);
}

/// Wraps [child] so tapping it opens the dialer for [phone] — drop this
/// around any phone number shown anywhere in the app (call detail,
/// contact list, contact detail, etc.) per spec item 6 ("в любом месте
/// в программе при нажатии на номер телефона").
class CallableText extends StatelessWidget {
  const CallableText(this.phone, {super.key, this.style, this.icon = true});

  final String phone;
  final TextStyle? style;
  final bool icon;

  @override
  Widget build(BuildContext context) {
    if (phone.trim().isEmpty) return const SizedBox.shrink();
    return InkWell(
      onTap: () => launchDialer(phone),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon) ...[
            Icon(Icons.call, size: (style?.fontSize ?? 14) + 2, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 4),
          ],
          Text(
            phone,
            style: (style ?? const TextStyle()).copyWith(
              color: Theme.of(context).colorScheme.primary,
              decoration: TextDecoration.underline,
            ),
          ),
        ],
      ),
    );
  }
}
