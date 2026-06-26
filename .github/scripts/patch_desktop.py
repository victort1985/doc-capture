#!/usr/bin/env python3
"""
Patches mobile-only dependencies and imports for Flutter desktop build.
- Replaces mobile_scanner with a no-op stub
- Replaces local_auth with a no-op stub
- Keeps all business logic intact
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/mobile-client'
LIB  = os.path.join(ROOT, 'lib')

# ── 1. Patch pubspec.yaml — remove/stub mobile-only packages ─────────────────
pubspec = os.path.join(ROOT, 'pubspec.yaml')
c = open(pubspec).read()

# Comment out mobile-only packages
for pkg in ['mobile_scanner', 'local_auth', 'flutter_secure_storage']:
    c = re.sub(rf'^  {pkg}:.*$', f'  # {pkg}: disabled for desktop', c, flags=re.MULTILINE)

open(pubspec, 'w').write(c)
print('✓ pubspec.yaml patched')

# ── 2. Create desktop stub for BarcodeScannerScreen ──────────────────────────
stub_scanner = os.path.join(LIB, 'screens', 'barcode_scanner_screen.dart')
open(stub_scanner, 'w').write("""
import 'package:flutter/material.dart';

/// Desktop stub — no camera available.
/// Shows a text input for manual barcode entry instead.
class BarcodeScannerScreen extends StatefulWidget {
  const BarcodeScannerScreen({super.key});
  @override
  State<BarcodeScannerScreen> createState() => _BarcodeScannerScreenState();
}

class _BarcodeScannerScreenState extends State<BarcodeScannerScreen> {
  final _ctrl = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Enter barcode')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Icon(Icons.qr_code, size: 64, color: Colors.grey),
          const SizedBox(height: 16),
          const Text('Camera not available on desktop.\\nEnter barcode manually:',
              textAlign: TextAlign.center),
          const SizedBox(height: 16),
          TextField(
            controller: _ctrl,
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'Barcode',
              border: OutlineInputBorder(),
            ),
            onSubmitted: (v) => Navigator.pop(context, v),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: () => Navigator.pop(context, _ctrl.text),
            child: const Text('Confirm'),
          ),
        ]),
      ),
    );
  }
}
""")
print('✓ barcode_scanner_screen.dart → desktop stub')

# ── 3. Patch local_auth usages ────────────────────────────────────────────────
for dirpath, _, files in os.walk(LIB):
    for fname in files:
        if not fname.endswith('.dart'): continue
        path = os.path.join(dirpath, fname)
        src = open(path).read()
        if 'local_auth' not in src and 'LocalAuthentication' not in src:
            continue
        # Replace local_auth imports and usage with stubs
        src = re.sub(r"import 'package:local_auth/.*?';", '', src)
        src = re.sub(r"import 'package:flutter_secure_storage/.*?';", '', src)
        src = src.replace('LocalAuthentication()', 'null')
        src = src.replace('await _auth.authenticate(', 'await Future.value(true); // desktop: _auth.authenticate(')
        open(path, 'w').write(src)
        print(f'✓ patched local_auth in {fname}')

# ── 4. Patch share_plus — desktop supports it, but sharePositionOrigin crashes ─
for dirpath, _, files in os.walk(LIB):
    for fname in files:
        if not fname.endswith('.dart'): continue
        path = os.path.join(dirpath, fname)
        src = open(path).read()
        if 'sharePositionOrigin' not in src: continue
        # Remove sharePositionOrigin param which is iOS-only
        src = re.sub(r',?\s*sharePositionOrigin:\s*\w+', '', src)
        open(path, 'w').write(src)
        print(f'✓ removed sharePositionOrigin from {fname}')

print('\n✅ Desktop patches applied')
