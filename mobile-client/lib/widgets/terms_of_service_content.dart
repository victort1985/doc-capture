import 'package:flutter/material.dart';
import '../data/tos_content.dart';

class TermsOfServiceContent extends StatelessWidget {
  const TermsOfServiceContent({super.key, required this.language});
  final String language;

  @override
  Widget build(BuildContext context) {
    final content = tosContent[language] ?? tosContent['en']!;
    final rtl = language == 'he';

    return Directionality(
      textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(content.title, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          const SizedBox(height: 2),
          Text(content.subtitle, textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          const SizedBox(height: 20),
          for (final sec in content.sections) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(sec.title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Color(0xFF0E1642))),
            ),
            for (final block in sec.blocks)
              Padding(
                padding: EdgeInsetsDirectional.only(start: block.type == 'bullet' ? 18 : 0, bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (block.type == 'bullet') const Text('•  '),
                    Expanded(
                      child: Text(
                        block.text,
                        style: TextStyle(
                          fontWeight: (block.bold || block.type == 'upper') ? FontWeight.bold : FontWeight.normal,
                          fontSize: block.type == 'upper' ? 12.5 : 13.5,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}
