import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../app/theme.dart';

class EulaScreen extends StatefulWidget {
  final VoidCallback onAccepted;
  final String languageCode;
  const EulaScreen({super.key, required this.onAccepted, required this.languageCode});

  @override
  State<EulaScreen> createState() => _EulaScreenState();
}

class _EulaScreenState extends State<EulaScreen> {
  bool _scrolledToBottom = false;
  bool _accepted = false;
  final _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollCtrl.addListener(() {
      if (!_scrolledToBottom) {
        final max = _scrollCtrl.position.maxScrollExtent;
        final cur = _scrollCtrl.offset;
        if (cur >= max - 40) setState(() => _scrolledToBottom = true);
      }
    });
  }

  @override
  void dispose() {
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _accept() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('eula_accepted_v1', true);
    widget.onAccepted();
  }

  String get _title {
    switch (widget.languageCode) {
      case 'he': return 'הסכם רישיון ותנאי שימוש';
      case 'ru': return 'Лицензионное соглашение';
      default:   return 'License Agreement & Terms of Use';
    }
  }

  String get _agreeBtn {
    switch (widget.languageCode) {
      case 'he': return 'אני מסכים/ה ומאשר/ת';
      case 'ru': return 'Я принимаю условия';
      default:   return 'I Agree & Accept';
    }
  }

  String get _declineBtn {
    switch (widget.languageCode) {
      case 'he': return 'סירוב — יציאה';
      case 'ru': return 'Отказаться — выход';
      default:   return 'Decline — Exit';
    }
  }

  String get _checkboxLabel {
    switch (widget.languageCode) {
      case 'he': return 'קראתי והבנתי את כל תנאי ההסכם';
      case 'ru': return 'Я прочитал(а) и понял(а) все условия';
      default:   return 'I have read and understood all terms';
    }
  }

  String get _scrollHint {
    switch (widget.languageCode) {
      case 'he': return 'גלול/י עד לסוף כדי להמשיך';
      case 'ru': return 'Прокрутите до конца чтобы продолжить';
      default:   return 'Scroll to the bottom to continue';
    }
  }

  String get _eulaText {
    switch (widget.languageCode) {
      case 'he': return _eulaHe;
      case 'ru': return _eulaRu;
      default:   return _eulaEn;
    }
  }

  bool get _isRtl => widget.languageCode == 'he';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Directionality(
          textDirection: _isRtl ? TextDirection.rtl : TextDirection.ltr,
          child: Column(children: [
            // Header
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              color: AppColors.primary,
              child: Row(children: [
                const Icon(Icons.gavel, color: Colors.white, size: 24),
                const SizedBox(width: 12),
                Expanded(child: Text(_title,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16),
                  maxLines: 2,
                )),
              ]),
            ),

            // Scroll hint
            if (!_scrolledToBottom)
              Container(
                color: const Color(0xFFFFF3CD),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(children: [
                  const Icon(Icons.keyboard_arrow_down, color: Color(0xFF856404), size: 18),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_scrollHint,
                    style: const TextStyle(color: Color(0xFF856404), fontSize: 13, fontWeight: FontWeight.w600),
                  )),
                ]),
              ),

            // EULA text
            Expanded(
              child: SingleChildScrollView(
                controller: _scrollCtrl,
                padding: const EdgeInsets.all(20),
                child: Text(
                  _eulaText,
                  textDirection: _isRtl ? TextDirection.rtl : TextDirection.ltr,
                  style: const TextStyle(fontSize: 13, height: 1.65, color: Color(0xFF333333)),
                ),
              ),
            ),

            // Bottom panel
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 12, offset: const Offset(0, -4))],
              ),
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                // Checkbox
                GestureDetector(
                  onTap: _scrolledToBottom ? () => setState(() => _accepted = !_accepted) : null,
                  child: Row(children: [
                    Checkbox(
                      value: _accepted,
                      onChanged: _scrolledToBottom ? (v) => setState(() => _accepted = v ?? false) : null,
                      activeColor: AppColors.primary,
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(_checkboxLabel,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: _scrolledToBottom ? const Color(0xFF1A1A1A) : AppColors.inkSoft,
                      ),
                    )),
                  ]),
                ),
                const SizedBox(height: 12),

                // Accept button
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: (_accepted && _scrolledToBottom) ? _accept : null,
                    icon: const Icon(Icons.check_circle_outline, size: 18),
                    label: Text(_agreeBtn, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      disabledBackgroundColor: Colors.grey.shade300,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
                const SizedBox(height: 8),

                // Decline button
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => _showDeclineDialog(context),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red.shade700,
                      side: BorderSide(color: Colors.red.shade300),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: Text(_declineBtn, style: const TextStyle(fontSize: 14)),
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  void _showDeclineDialog(BuildContext ctx) {
    late final String title, msg, cancel, exit_;
    switch (widget.languageCode) {
      case 'he':
        title = 'יציאה מהאפליקציה';
        msg = 'אם לא תסכים/י לתנאים, לא ניתן להשתמש בתוכנה.';
        cancel = 'חזרה';
        exit_ = 'יציאה';
        break;
      case 'ru':
        title = 'Выход из приложения';
        msg = 'Без принятия условий использование программы невозможно.';
        cancel = 'Назад';
        exit_ = 'Выйти';
        break;
      default:
        title = 'Exit Application';
        msg = 'You cannot use Vixor ERP without accepting the terms.';
        cancel = 'Back';
        exit_ = 'Exit';
    }
    showDialog(
      context: ctx,
      builder: (_) => AlertDialog(
        title: Text(title),
        content: Text(msg),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(cancel)),
          FilledButton(
            onPressed: () => _exitApp(),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: Text(exit_),
          ),
        ],
      ),
    );
  }

  void _exitApp() {
    SystemNavigator.pop();
  }
}

// ── EULA Texts ────────────────────────────────────────────────────────────────

const _eulaEn = '''END USER LICENSE AGREEMENT ("EULA")
VIXOR ERP SOFTWARE PLATFORM
Version 1.0 | Effective Date: June 27, 2026

PLEASE READ THIS AGREEMENT CAREFULLY BEFORE USING THE SOFTWARE. BY CLICKING "I AGREE" OR BY ACCESSING OR USING VIXOR ERP, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT USE THIS SOFTWARE.

────────────────────────────────

1. DEFINITIONS

"Software" means the Vixor ERP application, including all modules, updates, upgrades, and associated documentation.
"Licensor" means Viktor Tykhonov, the sole developer and rights holder of Vixor ERP.
"Licensee" or "You" means the individual or legal entity that has been granted access to the Software.
"Organization" means the company or entity on whose behalf You use the Software.

────────────────────────────────

2. GRANT OF LICENSE

Subject to the terms herein, Licensor grants You a limited, non-exclusive, non-transferable, revocable license to use the Software solely for Your internal business operations. This license does not include the right to sublicense, sell, resell, transfer, assign, or otherwise commercially exploit the Software.

────────────────────────────────

3. RESTRICTIONS

You shall NOT:
a) Reverse engineer, decompile, disassemble, or attempt to derive the source code of the Software;
b) Copy, modify, adapt, translate, or create derivative works based upon the Software;
c) Distribute, sublicense, lease, rent, loan, or otherwise transfer the Software to any third party;
d) Remove or alter any proprietary notices, labels, or marks on the Software;
e) Use the Software for any unlawful purpose or in violation of any applicable laws or regulations;
f) Attempt to gain unauthorized access to any portion of the Software or its related systems;
g) Use the Software to store or transmit malicious code, infringing content, or harmful data.

────────────────────────────────

4. INTELLECTUAL PROPERTY

The Software, including all intellectual property rights therein, is and shall remain the exclusive property of the Licensor. This Agreement does not transfer any ownership rights to You. All trademarks, service marks, trade names, and logos associated with Vixor ERP are proprietary to the Licensor.

────────────────────────────────

5. DATA AND PRIVACY

a) All data entered into the Software remains the property of the Licensee's Organization.
b) The Licensor does not access, use, or share Your data without Your explicit consent, except as required by law.
c) You are solely responsible for ensuring that Your use of the Software complies with applicable data protection laws, including but not limited to GDPR, Israeli Privacy Protection Law 5742-1981, and any other applicable regulations.
d) You are responsible for maintaining the confidentiality of Your login credentials.

────────────────────────────────

6. DISCLAIMER OF WARRANTIES

THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT ANY WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR UNINTERRUPTED OR ERROR-FREE OPERATION. THE LICENSOR DOES NOT WARRANT THAT THE SOFTWARE WILL MEET YOUR REQUIREMENTS OR THAT IT WILL BE COMPATIBLE WITH YOUR SYSTEMS.

────────────────────────────────

7. LIMITATION OF LIABILITY

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE LICENSOR BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, LOSS OF DATA, BUSINESS INTERRUPTION, OR LOSS OF GOODWILL, ARISING OUT OF OR IN CONNECTION WITH THIS AGREEMENT OR THE USE OR INABILITY TO USE THE SOFTWARE, EVEN IF THE LICENSOR HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

IN NO EVENT SHALL THE LICENSOR'S TOTAL CUMULATIVE LIABILITY TO YOU FOR ALL CLAIMS EXCEED THE AMOUNTS ACTUALLY PAID BY YOU FOR THE SOFTWARE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.

────────────────────────────────

8. INDEMNIFICATION

You agree to indemnify, defend, and hold harmless the Licensor and its affiliates, officers, directors, employees, agents, and licensors from and against any and all claims, damages, obligations, losses, liabilities, costs, and expenses (including attorney's fees) arising from: (a) Your use of the Software; (b) Your violation of this Agreement; (c) Your violation of any third-party right; or (d) any claim that Your data caused damage to a third party.

────────────────────────────────

9. THIRD-PARTY SERVICES

The Software may integrate with third-party services. The Licensor makes no representations or warranties regarding such third-party services and shall not be liable for any damages arising from Your use thereof.

────────────────────────────────

10. FORCE MAJEURE

The Licensor shall not be liable for any failure or delay in performance due to circumstances beyond its reasonable control, including acts of God, natural disasters, war, terrorism, pandemics, network failures, or other similar events.

────────────────────────────────

11. TERMINATION

This Agreement is effective until terminated. The Licensor may terminate this Agreement immediately and without notice if You breach any provision herein. Upon termination, all licenses granted hereunder shall immediately cease and You must cease all use of the Software.

────────────────────────────────

12. GOVERNING LAW AND DISPUTE RESOLUTION

This Agreement shall be governed by and construed in accordance with the laws of the State of Israel. Any dispute arising out of or relating to this Agreement shall be resolved exclusively by the competent courts located in Israel.

────────────────────────────────

13. ENTIRE AGREEMENT

This Agreement constitutes the entire agreement between You and the Licensor with respect to the Software and supersedes all prior negotiations, representations, warranties, and understandings.

────────────────────────────────

© 2026 Viktor Tykhonov. All Rights Reserved.
Vixor ERP is a proprietary software product.
Unauthorized reproduction or distribution is strictly prohibited.''';

const _eulaHe = '''הסכם רישיון למשתמש קצה ("EULA")
פלטפורמת תוכנה VIXOR ERP
גרסה 1.0 | תאריך כניסה לתוקף: 27 ביוני 2026

אנא קרא/י הסכם זה בעיון לפני השימוש בתוכנה. בלחיצה על "אני מסכים/ה" או בגישה לתוכנה ובשימוש בה, הינך מאשר/ת כי קראת, הבנת ומסכים/ה להיות כפוף/ה לתנאי הסכם זה. אם אינך מסכים/ה, אין להשתמש בתוכנה.

────────────────────────────────

1. הגדרות

"התוכנה" — אפליקציית Vixor ERP, לרבות כל המודולים, העדכונים, השדרוגים והתיעוד הנלווה.
"המעניק" — ויקטור טיחונוב, המפתח הבלעדי ובעל הזכויות ב-Vixor ERP.
"המשתמש" או "אתה/את" — היחיד או הגוף המשפטי שקיבל גישה לתוכנה.
"הארגון" — החברה או הגוף שבשמו משתמש/ת בתוכנה.

────────────────────────────────

2. מתן רישיון

בכפוף לתנאים המפורטים כאן, המעניק מעניק לך רישיון מוגבל, לא בלעדי, שאינו ניתן להעברה וניתן לביטול, לשימוש בתוכנה לצרכי הפעילות העסקית הפנימית שלך בלבד. רישיון זה אינו כולל זכות לתת רישיון משנה, למכור, להעביר, להקצות או לנצל מסחרית אחרת את התוכנה.

────────────────────────────────

3. הגבלות

אין לך:
א) לבצע הנדסה לאחור, פירוק, ניתוח קוד, או ניסיון לגלות את קוד המקור של התוכנה;
ב) להעתיק, לשנות, להתאים, לתרגם או ליצור יצירות נגזרות מהתוכנה;
ג) להפיץ, לתת רישיון משנה, להשכיר, להשאיל או להעביר את התוכנה לצד שלישי כלשהו;
ד) להסיר או לשנות כל הודעות קנייניות, תוויות או סמנים בתוכנה;
ה) להשתמש בתוכנה לכל מטרה בלתי חוקית או תוך הפרת חוקים ותקנות;
ו) לנסות לקבל גישה בלתי מורשית לכל חלק של התוכנה או מערכות הקשורות אליה;
ז) להשתמש בתוכנה לאחסון או שידור קוד זדוני, תוכן מפר זכויות, או נתונים מזיקים.

────────────────────────────────

4. קניין רוחני

התוכנה, לרבות כל זכויות הקניין הרוחני הגלומות בה, היא ותישאר רכושו הבלעדי של המעניק. הסכם זה אינו מעביר אליך כל זכויות בעלות. כל הסימנים המסחריים, שמות מסחריים וסמלים הקשורים ל-Vixor ERP הינם קנייניים של המעניק.

────────────────────────────────

5. נתונים ופרטיות

א) כל הנתונים שהוזנו לתוכנה הם רכוש הארגון של המשתמש.
ב) המעניק אינו ניגש, משתמש או משתף את הנתונים שלך ללא הסכמתך המפורשת, למעט כנדרש על פי חוק.
ג) הינך האחראי/ת הבלעדי/ת להבטיח כי השימוש שלך בתוכנה מציית לחוקי הגנת המידע, לרבות GDPR וחוק הגנת הפרטיות התשמ"א-1981.
ד) הינך אחראי/ת לשמירה על סודיות פרטי הגישה שלך.

────────────────────────────────

6. הכחשת אחריות

התוכנה מסופקת "כפי שהיא" ו"כפי שזמינה" ללא כל אחריות מכל סוג שהוא, מפורשת או משתמעת, לרבות אחריות לסחירות, התאמה למטרה מסוימת, אי-הפרה, או פעולה רציפה ונטולת שגיאות. המעניק אינו מתחייב שהתוכנה תענה על דרישותיך.

────────────────────────────────

7. הגבלת אחריות

במידה המרבית המותרת על פי הדין החל, בשום מקרה לא יהיה המעניק אחראי לכל נזק עקיף, מקרי, מיוחד, תוצאתי, עונשי או לדוגמה, לרבות אובדן רווחים, אובדן נתונים, הפרעה לעסקים, או אובדן מוניטין.

בשום מקרה לא תעלה האחריות המצטברת הכוללת של המעניק כלפיך על הסכומים ששולמו בפועל על ידך עבור התוכנה בשנים עשר (12) החודשים שקדמו לתביעה.

────────────────────────────────

8. שיפוי

הינך מסכים/ה לשפות, להגן ולהחזיק חף מאחריות את המעניק מפני כל תביעות, נזקים, התחייבויות, הפסדים, עלויות והוצאות (כולל שכר טרחת עורכי דין) הנובעים מ: (א) השימוש שלך בתוכנה; (ב) הפרתך של הסכם זה; (ג) הפרתך של כל זכות של צד שלישי; או (ד) כל טענה שהנתונים שלך גרמו נזק לצד שלישי.

────────────────────────────────

9. שירותי צד שלישי

התוכנה עשויה להשתלב עם שירותי צד שלישי. המעניק אינו מציג מצגים לגבי שירותים אלה ולא יהיה אחראי לנזקים הנובעים משימושך בהם.

────────────────────────────────

10. כוח עליון

המעניק לא יהיה אחראי לכל כשל או עיכוב בביצוע עקב נסיבות מחוץ לשליטתו הסבירה.

────────────────────────────────

11. סיום

המעניק רשאי לבטל הסכם זה באופן מיידי וללא הודעה מוקדמת אם תפר/י כל הוראה בו. עם הביטול, עליך להפסיק את כל השימוש בתוכנה.

────────────────────────────────

12. הדין החל ויישוב סכסוכים

הסכם זה יהיה כפוף לחוקי מדינת ישראל. כל סכסוך הנובע מהסכם זה יוכרע על ידי בתי המשפט המוסמכים בישראל.

────────────────────────────────

13. הסכם מלא

הסכם זה מהווה את ההסכם המלא בינך לבין המעניק לגבי התוכנה.

────────────────────────────────

© 2026 ויקטור טיחונוב. כל הזכויות שמורות.
Vixor ERP היא מוצר תוכנה קנייני.
העתקה או הפצה ללא רשות אסורות בהחלט.''';

const _eulaRu = '''ЛИЦЕНЗИОННОЕ СОГЛАШЕНИЕ С КОНЕЧНЫМ ПОЛЬЗОВАТЕЛЕМ
ПРОГРАММНАЯ ПЛАТФОРМА VIXOR ERP
Версия 1.0 | Дата вступления в силу: 27 июня 2026 г.

ВНИМАТЕЛЬНО ПРОЧИТАЙТЕ ЭТО СОГЛАШЕНИЕ ПЕРЕД ИСПОЛЬЗОВАНИЕМ. НАЖИМАЯ "Я СОГЛАСЕН" ИЛИ ПОЛУЧАЯ ДОСТУП К VIXOR ERP, ВЫ ПОДТВЕРЖДАЕТЕ, ЧТО ПРОЧИТАЛИ, ПОНЯЛИ И СОГЛАСИЛИСЬ СОБЛЮДАТЬ УСЛОВИЯ. ЕСЛИ ВЫ НЕ СОГЛАСНЫ — НЕ ИСПОЛЬЗУЙТЕ ПРОГРАММУ.

────────────────────────────────

1. ОПРЕДЕЛЕНИЯ

"Программное обеспечение" — приложение Vixor ERP, включая все модули, обновления и документацию.
"Лицензиар" — Виктор Тихонов, единственный разработчик и правообладатель Vixor ERP.
"Лицензиат" или "Вы" — физическое или юридическое лицо, получившее доступ к Программному обеспечению.
"Организация" — компания, от имени которой Вы используете Программное обеспечение.

────────────────────────────────

2. ПРЕДОСТАВЛЕНИЕ ЛИЦЕНЗИИ

Лицензиар предоставляет Вам ограниченную, неисключительную, непередаваемую, отзывную лицензию на использование Программного обеспечения исключительно для Вашей внутренней деловой деятельности. Настоящая лицензия не включает право на сублицензирование, продажу или иное коммерческое использование.

────────────────────────────────

3. ОГРАНИЧЕНИЯ

Вам ЗАПРЕЩАЕТСЯ:
а) осуществлять обратную разработку, декомпиляцию или попытки получить исходный код;
б) копировать, изменять, адаптировать или создавать производные работы;
в) распространять, сублицензировать или передавать Программное обеспечение третьим лицам;
г) удалять или изменять любые уведомления о правах собственности;
д) использовать в незаконных целях или в нарушение применимого законодательства;
е) пытаться получить несанкционированный доступ к системам;
ж) хранить или передавать вредоносный код или незаконный контент.

────────────────────────────────

4. ИНТЕЛЛЕКТУАЛЬНАЯ СОБСТВЕННОСТЬ

Программное обеспечение является и остаётся исключительной собственностью Лицензиара. Настоящее Соглашение не передаёт Вам никаких прав собственности. Все товарные знаки и логотипы Vixor ERP принадлежат Лицензиару.

────────────────────────────────

5. ДАННЫЕ И КОНФИДЕНЦИАЛЬНОСТЬ

а) Все данные, введённые в Программное обеспечение, остаются собственностью Вашей Организации.
б) Лицензиар не использует Ваши данные без Вашего согласия, за исключением случаев, предусмотренных законом.
в) Вы несёте ответственность за соблюдение законодательства о защите данных, включая GDPR, ФЗ-152 "О персональных данных" и Закон Израиля о защите конфиденциальности.
г) Вы обязаны хранить в тайне свои учётные данные.

────────────────────────────────

6. ОТКАЗ ОТ ГАРАНТИЙ

ПРОГРАММНОЕ ОБЕСПЕЧЕНИЕ ПРЕДОСТАВЛЯЕТСЯ "КАК ЕСТЬ" БЕЗ КАКИХ-ЛИБО ГАРАНТИЙ, ЯВНЫХ ИЛИ ПОДРАЗУМЕВАЕМЫХ, ВКЛЮЧАЯ ГАРАНТИИ ТОВАРНОЙ ПРИГОДНОСТИ, ПРИГОДНОСТИ ДЛЯ КОНКРЕТНОЙ ЦЕЛИ ИЛИ НЕНАРУШЕНИЯ ПРАВ.

────────────────────────────────

7. ОГРАНИЧЕНИЕ ОТВЕТСТВЕННОСТИ

НИ ПРИ КАКИХ ОБСТОЯТЕЛЬСТВАХ ЛИЦЕНЗИАР НЕ НЕСЁТ ОТВЕТСТВЕННОСТИ ЗА КОСВЕННЫЕ, СЛУЧАЙНЫЕ, СПЕЦИАЛЬНЫЕ, ПОСЛЕДУЮЩИЕ ИЛИ ШТРАФНЫЕ УБЫТКИ, ВКЛЮЧАЯ ПОТЕРЮ ПРИБЫЛИ, ДАННЫХ ИЛИ ДЕЛОВОЙ РЕПУТАЦИИ.

СОВОКУПНАЯ ОТВЕТСТВЕННОСТЬ ЛИЦЕНЗИАРА НЕ ПРЕВЫСИТ СУММ, ФАКТИЧЕСКИ УПЛАЧЕННЫХ ВАМИ ЗА ДВЕНАДЦАТЬ (12) МЕСЯЦЕВ, ПРЕДШЕСТВУЮЩИХ ПРЕДЪЯВЛЕНИЮ ТРЕБОВАНИЯ.

────────────────────────────────

8. ВОЗМЕЩЕНИЕ УБЫТКОВ

Вы соглашаетесь возмещать убытки Лицензиара, возникающие из: (а) Вашего использования Программного обеспечения; (б) нарушения настоящего Соглашения; (в) нарушения прав третьих лиц; (г) претензий о том, что Ваши данные причинили ущерб третьим лицам.

────────────────────────────────

9. СТОРОННИЕ СЕРВИСЫ

Программное обеспечение может интегрироваться со сторонними сервисами. Лицензиар не несёт ответственности за убытки от их использования.

────────────────────────────────

10. ФОРС-МАЖОР

Лицензиар не несёт ответственности за задержки, вызванные обстоятельствами непреодолимой силы.

────────────────────────────────

11. РАСТОРЖЕНИЕ

Лицензиар вправе немедленно расторгнуть данное Соглашение при его нарушении. При расторжении Вы обязаны прекратить использование Программного обеспечения.

────────────────────────────────

12. ПРИМЕНИМОЕ ПРАВО

Настоящее Соглашение регулируется законодательством Государства Израиль. Все споры рассматриваются судами Израиля.

────────────────────────────────

13. ПОЛНОТА СОГЛАШЕНИЯ

Настоящее Соглашение является полным соглашением между Вами и Лицензиаром.

────────────────────────────────

© 2026 Виктор Тихонов. Все права защищены.
Vixor ERP является проприетарным программным продуктом.
Несанкционированное воспроизведение строго запрещено.''';
