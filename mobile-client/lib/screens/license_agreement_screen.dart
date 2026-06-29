import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../services/settings_service.dart';
import '../store/app_state.dart';
import 'root_screen.dart';

class LicenseAgreementScreen extends StatefulWidget {
  const LicenseAgreementScreen({super.key});

  @override
  State<LicenseAgreementScreen> createState() => _LicenseAgreementScreenState();
}

class _LicenseAgreementScreenState extends State<LicenseAgreementScreen> {
  final _scrollCtrl = ScrollController();
  bool _scrolledToBottom = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _scrollCtrl.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollCtrl.removeListener(_onScroll);
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrolledToBottom) return;
    final pos = _scrollCtrl.position;
    if (pos.pixels >= pos.maxScrollExtent - 40) {
      setState(() => _scrolledToBottom = true);
    }
  }

  Future<void> _accept() async {
    final appState = context.read<AppState>();
    final userId = appState.currentUser!.id;
    setState(() => _saving = true);
    final settingsService = SettingsService();
    await settingsService.acceptLicense(userId);
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const RootScreen()),
    );
  }

  Future<void> _decline() async {
    await context.read<AppState>().logout();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('License Agreement'),
        automaticallyImplyLeading: false,
      ),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              controller: _scrollCtrl,
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
              child: const _LicenseText(),
            ),
          ),
          if (!_scrolledToBottom)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Icon(Icons.keyboard_arrow_down, size: 18, color: AppColors.inkSoft),
                const SizedBox(width: 4),
                Text('Scroll down to read the full agreement',
                  style: TextStyle(fontSize: 12, color: AppColors.inkSoft)),
              ]),
            ),
          Container(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: Colors.grey.shade200)),
            ),
            child: Column(children: [
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: (_scrolledToBottom && !_saving) ? _accept : null,
                  child: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('I Agree'),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _saving ? null : _decline,
                  style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                  child: const Text('Decline & Log Out'),
                ),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _LicenseText extends StatelessWidget {
  const _LicenseText();

  @override
  Widget build(BuildContext context) {
    const headStyle = TextStyle(fontWeight: FontWeight.w700, fontSize: 15);
    const bodyStyle = TextStyle(fontSize: 13, height: 1.6);
    const soft = TextStyle(fontSize: 12, color: AppColors.inkSoft, height: 1.5);

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Center(child: Column(children: [
        const Icon(Icons.gavel_outlined, size: 40, color: AppColors.primary),
        const SizedBox(height: 8),
        const Text('Vixor ERP — End User License Agreement',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
          textAlign: TextAlign.center),
        const SizedBox(height: 4),
        Text('Last updated: June 2026', style: soft, textAlign: TextAlign.center),
      ])),
      const SizedBox(height: 20),

      _section('1. Acceptance of Terms', headStyle,
        'By accessing or using Vixor ERP ("the Application"), you agree to be bound '
        'by this End User License Agreement ("Agreement"). If you do not agree to '
        'these terms, you must not use the Application and must notify your system '
        'administrator immediately.', bodyStyle),

      _section('2. License Grant', headStyle,
        'Subject to the terms of this Agreement, you are granted a non-exclusive, '
        'non-transferable, limited license to use the Application solely for your '
        'organization\'s internal business operations. You may not sublicense, sell, '
        'resell, transfer, assign, or otherwise dispose of the Application.', bodyStyle),

      _section('3. Restrictions', headStyle,
        'You agree not to: (a) copy, modify, or distribute the Application or any '
        'part thereof; (b) reverse engineer, decompile, or disassemble the Application; '
        '(c) use the Application to transmit any unlawful, harmful, or objectionable '
        'material; (d) share your login credentials with any other person; '
        '(e) access the Application for any purpose other than legitimate business use.', bodyStyle),

      _section('4. Data and Privacy', headStyle,
        'The Application processes data entered by you ("User Data") solely to provide '
        'the services described. User Data is stored on your organization\'s server. '
        'You are responsible for ensuring that data you enter does not violate any '
        'applicable privacy law or regulation. The Application does not transmit User '
        'Data to any third party outside your organization\'s infrastructure.', bodyStyle),

      _section('5. Confidentiality', headStyle,
        'You acknowledge that the Application and all information accessible through '
        'it are confidential and proprietary to your organization. You agree to '
        'maintain strict confidentiality and not to disclose any such information to '
        'any unauthorized person.', bodyStyle),

      _section('6. Intellectual Property', headStyle,
        'The Application, including all software, designs, and content, is the '
        'exclusive property of Vixor ERP and is protected by applicable intellectual '
        'property laws. This Agreement does not convey to you any ownership interest '
        'in the Application.', bodyStyle),

      _section('7. Disclaimer of Warranties', headStyle,
        'THE APPLICATION IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. TO THE '
        'MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, VIXOR ERP DISCLAIMS ALL '
        'WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, '
        'FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.', bodyStyle),

      _section('8. Limitation of Liability', headStyle,
        'IN NO EVENT SHALL VIXOR ERP BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, '
        'CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF '
        'THE APPLICATION, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.', bodyStyle),

      _section('9. Termination', headStyle,
        'This Agreement is effective until terminated. Your rights under this Agreement '
        'will terminate automatically if you fail to comply with any of its terms. '
        'Upon termination, you must cease all use of the Application.', bodyStyle),

      _section('10. Governing Law', headStyle,
        'This Agreement shall be governed by and construed in accordance with the laws '
        'of the State of Israel, without regard to conflict of law principles.', bodyStyle),

      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.primary.withOpacity(0.06),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.primary.withOpacity(0.2)),
        ),
        child: const Text(
          'By tapping "I Agree" below, you confirm that you have read, understood, '
          'and agree to be bound by this End User License Agreement.',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, height: 1.5),
          textAlign: TextAlign.center,
        ),
      ),
      const SizedBox(height: 8),
    ]);
  }

  static Widget _section(String title, TextStyle titleStyle, String body, TextStyle bodyStyle) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: titleStyle),
      const SizedBox(height: 4),
      Text(body, style: bodyStyle),
    ]),
  );
}
