// Terms of Service content — structured data rendered by TermsOfServiceContent widget.
// Bump server/src/modules/auth/auth.service.ts's TOS_VERSION whenever this
// text materially changes, so every user is asked to accept again.

class TosBlock {
  final String type; // 'p' | 'bullet' | 'upper'
  final String text;
  final bool bold;
  const TosBlock({required this.type, required this.text, this.bold = false});
}

class TosSection {
  final String title;
  final List<TosBlock> blocks;
  const TosSection({required this.title, required this.blocks});
}

class TosContent {
  final String title;
  final String subtitle;
  final List<TosSection> sections;
  const TosContent({required this.title, required this.subtitle, required this.sections});
}

const Map<String, TosContent> tosContent = {
  'en': TosContent(
    title: 'TERMS OF SERVICE',
    subtitle: 'for the use of the Vixor ERP software',
    sections: [
      TosSection(title: '1. Definitions', blocks: [
        TosBlock(type: 'p', text: '"Provider" means the rights holder and operator of the Vixor ERP software, granting access to the Service under these Terms.'),
        TosBlock(type: 'p', text: '"User" / "Organization" means the legal entity or sole proprietor that has entered into an agreement with the Provider by accepting these Terms and has been granted access to the Service for use in its commercial activity.'),
        TosBlock(type: 'p', text: '"Service" means the Vixor ERP software, including the web admin panel, mobile application, and server infrastructure, provided on a SaaS (Software as a Service) basis.'),
        TosBlock(type: 'p', text: '"Documents" means any quotes, invoices, delivery notes, reports, files, or other documents created, stored, or processed by the User through the Service.'),
        TosBlock(type: 'p', text: '"User\'s Clients" / "Third Parties" means the User\'s counterparties, customers, and partners, as well as any government bodies, agencies, and organizations to which the User transmits Documents created in the Service.'),
      ]),
      TosSection(title: '2. Subject of the Agreement', blocks: [
        TosBlock(type: 'p', text: '2.1. The Provider grants the User a non-exclusive licence to use the Service, in the scope and for the term determined by the selected pricing plan.'),
        TosBlock(type: 'p', text: '2.2. The Service provides tools for conducting business operations: service call tracking, creating quotes, invoices, and delivery notes, warehouse and fleet management, calendar synchronization, and other functionality described in the Service documentation.'),
        TosBlock(type: 'p', text: '2.3. The Provider acts solely as the developer and operator of a technical platform. The Provider is not a party to any transaction, agreement, or relationship between the User and the User\'s Clients, and does not participate in the User\'s business activity.'),
      ]),
      TosSection(title: '3. Acceptance of these Terms', blocks: [
        TosBlock(type: 'p', text: '3.1. These Terms are accepted by the User performing any of the following: registering an account, installing the mobile application, logging into the system using the provided credentials, or otherwise actually using the Service in any form.'),
        TosBlock(type: 'p', text: '3.2. Upon acceptance, these Terms constitute a binding agreement between the Provider and the User on the terms set out herein.'),
      ]),
      TosSection(title: '4. Acceptable Use', blocks: [
        TosBlock(type: 'p', text: '4.1. The User shall not use the Service to: violate applicable law; transmit data that infringes the rights of third parties; attempt unauthorized access to the Service or its infrastructure; decompile, disassemble, or otherwise reverse-engineer the software; share account credentials with anyone outside the Organization; or engage in conduct that impairs the Service\'s operation or places an unreasonable load on its infrastructure.'),
        TosBlock(type: 'p', text: '4.2. The Provider may suspend the User\'s access to the Service upon reasonable suspicion of a breach of this Section, notifying the User at the earliest opportunity.'),
      ]),
      TosSection(title: '5. User Responsibility', blocks: [
        TosBlock(type: 'p', text: 'Sole responsibility for the content, accuracy, and consequences of using Documents created in the Service rests with the User.', bold: true),
        TosBlock(type: 'p', text: '5.1. The User bears full and exclusive responsibility for:'),
        TosBlock(type: 'bullet', text: 'the accuracy, completeness, and correctness of all data entered into the Service, including financial data, prices, amounts, business details, tax data, and data about the User\'s Clients;'),
        TosBlock(type: 'bullet', text: 'the correctness and lawfulness of the content of all Documents generated through the Service, including their compliance with applicable tax, accounting, and other law;'),
        TosBlock(type: 'bullet', text: 'the decision to transmit, send, present, or disclose Documents to any third party, including the User\'s Clients, counterparties, banks, insurers, government bodies, tax authorities, or other regulators;'),
        TosBlock(type: 'bullet', text: 'compliance with applicable law in conducting its business, including consumer protection law, tax law, and industry-specific regulation;'),
        TosBlock(type: 'bullet', text: 'the correctness of the Service\'s configuration (including document templates, numbering, email-sending settings, and storage settings) and the consequences of using that configuration;'),
        TosBlock(type: 'bullet', text: 'the security and confidentiality of the Organization\'s user credentials, and any actions taken under those credentials;'),
        TosBlock(type: 'bullet', text: 'maintaining its own backups of data critical to its operations, beyond the standard measures taken by the Provider.'),
        TosBlock(type: 'p', text: '5.2. The Provider does not review, verify, or take responsibility for the content, accuracy, or legal validity of Documents created by the User. The Service is a tool for creating and storing Documents and does not substitute for professional accounting, tax, or legal advice.'),
        TosBlock(type: 'p', text: '5.3. Any errors, inaccuracies, disputes, or claims arising in connection with the content of Documents or their transmission to third parties shall be resolved solely between the User and the relevant third party, without the Provider\'s involvement.'),
      ]),
      TosSection(title: '6. Limitation of Provider Liability', blocks: [
        TosBlock(type: 'upper', text: 'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE, UNINTERRUPTED OPERATION, OR FREEDOM FROM ERRORS. THE PROVIDER DOES NOT GUARANTEE ANY SPECIFIC UPTIME PERCENTAGE UNLESS EXPRESSLY AGREED IN A SEPARATE SERVICE LEVEL AGREEMENT.'),
        TosBlock(type: 'p', text: '6.1. The Provider shall not be liable for:'),
        TosBlock(type: 'bullet', text: 'any direct, indirect, incidental, punitive, or consequential damages, including lost profits, data loss, or reputational harm, arising from use of or inability to use the Service;'),
        TosBlock(type: 'bullet', text: 'the content, accuracy, or consequences of using Documents created by the User (see Section 5);'),
        TosBlock(type: 'bullet', text: 'the acts or omissions of third parties and third-party services integrated with or used to operate the Service (including, without limitation: email providers, Google Calendar, content delivery networks, and payment processors);'),
        TosBlock(type: 'bullet', text: 'interruptions to the Service caused by maintenance, third-party infrastructure failures, or force majeure;'),
        TosBlock(type: 'bullet', text: 'data loss resulting from the User\'s own actions, including deletion resulting from automatic cleanup in demo mode, where used.'),
        TosBlock(type: 'p', text: '6.2. The Provider\'s total liability to the User on any basis relating to the use of the Service is limited to the amount actually paid by the User to the Provider in the 12 (twelve) months preceding the event giving rise to the claim.'),
      ]),
      TosSection(title: '7. Data Protection and Confidentiality', blocks: [
        TosBlock(type: 'p', text: '7.1. In using the Service, the User enters and processes the personal data of third parties (the User\'s Clients, employees, and other data subjects). In this relationship, the User acts as the controller of personal data, and the Provider acts as a technical processor, providing infrastructure for storing and processing data on the User\'s instructions.'),
        TosBlock(type: 'p', text: '7.2. The User is solely responsible for having a lawful basis to collect and process its Clients\' personal data, including obtaining any necessary consents, and for complying with Israel\'s Protection of Privacy Law and any other applicable data protection law.'),
        TosBlock(type: 'p', text: '7.3. The Provider applies the following technical and organizational data protection measures:'),
        TosBlock(type: 'bullet', text: 'complete isolation of each organization\'s data at the level of a separate database;'),
        TosBlock(type: 'bullet', text: 'encryption of stored credentials (passwords, email and external storage access keys) and device connection files;'),
        TosBlock(type: 'bullet', text: 'data transmission over a secure protocol (HTTPS/TLS);'),
        TosBlock(type: 'bullet', text: 'role- and permission-based access control;'),
        TosBlock(type: 'bullet', text: 'the ability to immediately disable a device\'s or organization\'s access through the centralized licensing system.'),
        TosBlock(type: 'p', text: '7.4. Notwithstanding these measures, the Provider does not guarantee absolute protection against unauthorized access and shall not be liable for the consequences of such access, except where caused by the Provider\'s gross negligence or wilful misconduct.'),
        TosBlock(type: 'p', text: '7.5. Upon the User\'s request, the Provider will delete or export the Organization\'s data within a reasonable time, except for data whose retention is required by law.'),
        TosBlock(type: 'p', text: '7.6. In demo mode, all Organization data is automatically and permanently deleted after the configured retention period (10 days from creation, by default). Demo mode may not be used to store real data.'),
      ]),
      TosSection(title: '8. Indemnification', blocks: [
        TosBlock(type: 'p', text: '8.1. The User shall indemnify and hold the Provider harmless from any claims, demands, damages, and expenses (including reasonable legal costs) arising out of:'),
        TosBlock(type: 'bullet', text: 'the content of Documents created by the User and their transmission to third parties;'),
        TosBlock(type: 'bullet', text: 'the User\'s violation of applicable law in using the Service;'),
        TosBlock(type: 'bullet', text: 'infringement of third-party rights, including personal-data rights, arising from the User\'s use of the Service;'),
        TosBlock(type: 'bullet', text: 'use of the Service in breach of these Terms, including Section 4 (Acceptable Use).'),
      ]),
      TosSection(title: '9. Intellectual Property', blocks: [
        TosBlock(type: 'p', text: '9.1. All exclusive rights to the Service\'s software, code, design, and trademarks belong to the Provider. These Terms grant the User no rights in the software other than the right to use it in accordance with the selected pricing plan.'),
        TosBlock(type: 'p', text: '9.2. All data, documents, and materials created by the User within the Service remain the User\'s property.'),
      ]),
      TosSection(title: '10. Fees and Payment', blocks: [
        TosBlock(type: 'p', text: '10.1. The cost of using the Service is determined by the Provider\'s pricing plans in effect on the date of payment.'),
        TosBlock(type: 'p', text: '10.2. Payment is made in advance for each billing period, unless otherwise agreed separately by the parties.'),
        TosBlock(type: 'p', text: '10.3. The Provider may change its pricing by giving the User at least 30 days\' notice before the change takes effect.'),
      ]),
      TosSection(title: '11. Term and Termination', blocks: [
        TosBlock(type: 'p', text: '11.1. The agreement is effective from acceptance of these Terms until terminated by either party.'),
        TosBlock(type: 'p', text: '11.2. The User may stop using the Service at any time.'),
        TosBlock(type: 'p', text: '11.3. The Provider may suspend or terminate the User\'s access to the Service in the event of a breach of these Terms or non-payment for the Service.'),
        TosBlock(type: 'p', text: '11.4. Termination does not relieve either party of its obligations under Sections 5, 6, 7, and 8, or any other provision that by its nature is intended to survive termination — these provisions remain in effect after termination.'),
      ]),
      TosSection(title: '12. Force Majeure', blocks: [
        TosBlock(type: 'p', text: '12.1. Neither party shall be liable for full or partial non-performance of its obligations where such non-performance results from circumstances beyond its reasonable control, including, without limitation: natural disasters, acts of war, actions of government authorities, and failures of internet infrastructure or third-party cloud services.'),
      ]),
      TosSection(title: '13. Dispute Resolution and Governing Law', blocks: [
        TosBlock(type: 'p', text: '13.1. These Terms are governed by the laws of the State of Israel.'),
        TosBlock(type: 'p', text: '13.2. The parties shall use reasonable efforts to resolve disputes through negotiation. Failing agreement, disputes shall be submitted to the courts having jurisdiction over the Provider\'s place of business, except where mandatory provisions of applicable law require otherwise.'),
      ]),
      TosSection(title: '14. General Provisions', blocks: [
        TosBlock(type: 'p', text: '14.1. The Provider may amend these Terms unilaterally by publishing a revised version. Continued use of the Service after such changes constitutes the User\'s acceptance of the revised Terms.'),
        TosBlock(type: 'p', text: '14.2. If any provision of these Terms is held invalid, the remaining provisions shall continue in full force and effect.'),
      ]),
    ],
  ),
  'ru': TosContent(
    title: 'ПУБЛИЧНАЯ ОФЕРТА',
    subtitle: 'на использование программного обеспечения Vixor ERP',
    sections: [
      TosSection(title: '1. Термины и определения', blocks: [
        TosBlock(type: 'p', text: '«Поставщик» — правообладатель и оператор программного обеспечения Vixor ERP, предоставляющий доступ к Сервису на условиях настоящей оферты.'),
        TosBlock(type: 'p', text: '«Пользователь» / «Организация» — юридическое или физическое лицо (индивидуальный предприниматель), заключившее договор с Поставщиком путём акцепта настоящей оферты и получившее доступ к Сервису для использования в своей коммерческой деятельности.'),
        TosBlock(type: 'p', text: '«Сервис» — программное обеспечение Vixor ERP, включая веб-панель администратора, мобильное приложение и серверную инфраструктуру, предоставляемые по модели SaaS (программное обеспечение как услуга).'),
        TosBlock(type: 'p', text: '«Документы» — любые сметы, счета, накладные, отчёты, файлы и иные документы, создаваемые, хранимые или обрабатываемые Пользователем с помощью Сервиса.'),
        TosBlock(type: 'p', text: '«Клиенты Пользователя» / «Третьи лица» — контрагенты, заказчики, партнёры Пользователя, а также государственные органы, учреждения и организации, которым Пользователь передаёт Документы, созданные в Сервисе.'),
      ]),
      TosSection(title: '2. Предмет оферты', blocks: [
        TosBlock(type: 'p', text: '2.1. Поставщик предоставляет Пользователю право использования Сервиса на условиях простой (неисключительной) лицензии в объёме и на срок, определяемых выбранным тарифным планом.'),
        TosBlock(type: 'p', text: '2.2. Сервис предоставляет Пользователю инструменты для ведения хозяйственной деятельности: учёт заявок, создание смет, счетов и накладных, управление складом и автопарком, синхронизацию календаря и иные функции, описанные в документации Сервиса.'),
        TosBlock(type: 'p', text: '2.3. Поставщик выступает исключительно как разработчик и оператор технической платформы. Поставщик не является стороной каких-либо сделок, соглашений или взаимоотношений между Пользователем и его Клиентами, и не участвует в хозяйственной деятельности Пользователя.'),
      ]),
      TosSection(title: '3. Порядок акцепта оферты', blocks: [
        TosBlock(type: 'p', text: '3.1. Акцептом настоящей оферты является совершение Пользователем любого из следующих действий: регистрация учётной записи, установка мобильного приложения, вход в систему с использованием предоставленных учётных данных, либо фактическое использование Сервиса в любой форме.'),
        TosBlock(type: 'p', text: '3.2. С момента акцепта настоящая оферта считается заключённым между Поставщиком и Пользователем договором на изложенных в ней условиях.'),
      ]),
      TosSection(title: '4. Правила допустимого использования', blocks: [
        TosBlock(type: 'p', text: '4.1. Пользователю запрещается использовать Сервис для: нарушения применимого законодательства; передачи данных, нарушающих права третьих лиц; попыток несанкционированного доступа к Сервису или его инфраструктуре; декомпиляции, дизассемблирования или иного обратного проектирования программного обеспечения; передачи учётных данных третьим лицам, не являющимся сотрудниками Организации; действий, направленных на нарушение работоспособности Сервиса или создающих чрезмерную нагрузку на его инфраструктуру.'),
        TosBlock(type: 'p', text: '4.2. Поставщик вправе приостановить доступ Пользователя к Сервису при обоснованном подозрении на нарушение настоящего раздела, уведомив Пользователя при первой возможности.'),
      ]),
      TosSection(title: '5. Ответственность Пользователя', blocks: [
        TosBlock(type: 'p', text: 'Вся ответственность за содержание, точность и последствия использования Документов, созданных в Сервисе, лежит исключительно на Пользователе.', bold: true),
        TosBlock(type: 'p', text: '5.1. Пользователь несёт полную и исключительную ответственность за:'),
        TosBlock(type: 'bullet', text: 'достоверность, полноту и точность всех данных, вносимых в Сервис, включая финансовые данные, цены, суммы, реквизиты, налоговые данные и данные о Клиентах Пользователя;'),
        TosBlock(type: 'bullet', text: 'правильность и законность содержания всех Документов, формируемых с помощью Сервиса, включая их соответствие требованиям налогового, бухгалтерского и иного применимого законодательства;'),
        TosBlock(type: 'bullet', text: 'решение о передаче, направлении, представлении или раскрытии Документов любым третьим лицам, включая Клиентов Пользователя, контрагентов, банки, страховые компании, государственные органы, налоговые и иные регулирующие учреждения;'),
        TosBlock(type: 'bullet', text: 'соблюдение применимого законодательства при ведении хозяйственной деятельности, включая законодательство о защите прав потребителей, налоговое законодательство и отраслевое регулирование;'),
        TosBlock(type: 'bullet', text: 'корректность настройки Сервиса (включая шаблоны документов, нумерацию, настройки email-рассылки и хранилища) и последствия использования этих настроек;'),
        TosBlock(type: 'bullet', text: 'сохранность и конфиденциальность учётных данных пользователей Организации, а также действия, совершённые под этими учётными данными;'),
        TosBlock(type: 'bullet', text: 'резервное копирование данных, критически важных для деятельности Пользователя, помимо стандартных мер, принимаемых Поставщиком.'),
        TosBlock(type: 'p', text: '5.2. Поставщик не проверяет, не удостоверяет и не несёт ответственности за содержание, точность или юридическую силу Документов, создаваемых Пользователем. Сервис является инструментом для создания и хранения Документов и не заменяет профессиональную бухгалтерскую, налоговую или юридическую консультацию.'),
        TosBlock(type: 'p', text: '5.3. Любые ошибки, неточности, споры или претензии, возникающие в связи с содержанием Документов или их передачей третьим лицам, подлежат урегулированию исключительно между Пользователем и соответствующим третьим лицом, без участия Поставщика.'),
      ]),
      TosSection(title: '6. Ограничение ответственности Поставщика', blocks: [
        TosBlock(type: 'upper', text: 'СЕРВИС ПРЕДОСТАВЛЯЕТСЯ ПО ПРИНЦИПУ «КАК ЕСТЬ» (AS IS) И «ПО МЕРЕ ДОСТУПНОСТИ» (AS AVAILABLE), БЕЗ КАКИХ-ЛИБО ГАРАНТИЙ, ЯВНЫХ ИЛИ ПОДРАЗУМЕВАЕМЫХ, ВКЛЮЧАЯ ГАРАНТИИ ПРИГОДНОСТИ ДЛЯ КОНКРЕТНОЙ ЦЕЛИ, БЕСПЕРЕБОЙНОЙ РАБОТЫ ИЛИ ОТСУТСТВИЯ ОШИБОК. ПОСТАВЩИК НЕ ГАРАНТИРУЕТ КАКОЙ-ЛИБО КОНКРЕТНЫЙ ПРОЦЕНТ ВРЕМЕНИ БЕСПЕРЕБОЙНОЙ РАБОТЫ СЕРВИСА, ЕСЛИ ИНОЕ ПРЯМО НЕ СОГЛАСОВАНО ОТДЕЛЬНЫМ СОГЛАШЕНИЕМ ОБ УРОВНЕ ОБСЛУЖИВАНИЯ (SLA).'),
        TosBlock(type: 'p', text: '6.1. Поставщик не несёт ответственности за:'),
        TosBlock(type: 'bullet', text: 'любые прямые, косвенные, случайные, штрафные или последующие убытки, включая упущенную выгоду, потерю данных или репутационный ущерб, возникшие в связи с использованием или невозможностью использования Сервиса;'),
        TosBlock(type: 'bullet', text: 'содержание, точность и последствия использования Документов, созданных Пользователем (см. Раздел 5);'),
        TosBlock(type: 'bullet', text: 'действия или бездействие третьих лиц и сторонних сервисов, интегрированных с Сервисом или используемых для его работы (включая, но не ограничиваясь: почтовые провайдеры, Google Calendar, сети доставки контента, платёжные системы);'),
        TosBlock(type: 'bullet', text: 'перерывы в работе Сервиса, вызванные техническим обслуживанием, сбоями сторонней инфраструктуры или обстоятельствами непреодолимой силы;'),
        TosBlock(type: 'bullet', text: 'утрату данных вследствие действий Пользователя, включая удаление данных, произошедшее в результате автоматической очистки в демонстрационном режиме (демо-аккаунт) при использовании такового.'),
        TosBlock(type: 'p', text: '6.2. Совокупная ответственность Поставщика перед Пользователем по любым основаниям, связанным с использованием Сервиса, ограничивается суммой, фактически уплаченной Пользователем Поставщику за 12 (двенадцать) месяцев, предшествующих событию, послужившему основанием для претензии.'),
      ]),
      TosSection(title: '7. Защита персональных данных и конфиденциальность', blocks: [
        TosBlock(type: 'p', text: '7.1. При использовании Сервиса Пользователь вносит и обрабатывает персональные данные третьих лиц (Клиентов Пользователя, сотрудников и иных субъектов данных). В этих правоотношениях Пользователь выступает в качестве оператора (контроллера) персональных данных, а Поставщик — в качестве технического обработчика, предоставляющего инфраструктуру для хранения и обработки данных по поручению Пользователя.'),
        TosBlock(type: 'p', text: '7.2. Пользователь самостоятельно несёт ответственность за наличие законных оснований для сбора и обработки персональных данных своих Клиентов, включая получение необходимых согласий, за соблюдение Закона о защите частной жизни (חוק הגנת הפרטיות) и иного применимого законодательства о защите данных.'),
        TosBlock(type: 'p', text: '7.3. Поставщик применяет следующие технические и организационные меры защиты данных:'),
        TosBlock(type: 'bullet', text: 'полная изоляция данных каждой организации на уровне отдельной базы данных;'),
        TosBlock(type: 'bullet', text: 'шифрование хранимых учётных данных (паролей, ключей доступа к почте и внешним хранилищам) и файлов подключения устройств;'),
        TosBlock(type: 'bullet', text: 'передача данных по защищённому протоколу (HTTPS/TLS);'),
        TosBlock(type: 'bullet', text: 'ограничение доступа к данным на основе ролей и разрешений пользователей;'),
        TosBlock(type: 'bullet', text: 'возможность немедленного отключения доступа устройства или организации через централизованную систему лицензирования.'),
        TosBlock(type: 'p', text: '7.4. Несмотря на принимаемые меры, Поставщик не гарантирует абсолютную защиту от несанкционированного доступа и не несёт ответственности за последствия такого доступа, произошедшего не по грубой небрежности или умыслу Поставщика.'),
        TosBlock(type: 'p', text: '7.5. По запросу Пользователя Поставщик обеспечивает удаление или экспорт данных Организации в разумный срок, за исключением данных, хранение которых требуется по закону.'),
        TosBlock(type: 'p', text: '7.6. В демонстрационном режиме (демо-аккаунт) все данные Организации автоматически и безвозвратно удаляются по истечении установленного периода хранения (по умолчанию — 10 дней с момента создания записи). Использование демо-режима для хранения реальных данных не допускается.'),
      ]),
      TosSection(title: '8. Возмещение убытков (индемнификация)', blocks: [
        TosBlock(type: 'p', text: '8.1. Пользователь обязуется возместить и оградить Поставщика от любых претензий, требований, убытков, расходов (включая обоснованные судебные издержки), возникших в связи с:'),
        TosBlock(type: 'bullet', text: 'содержанием Документов, созданных Пользователем, и их передачей третьим лицам;'),
        TosBlock(type: 'bullet', text: 'нарушением Пользователем применимого законодательства при использовании Сервиса;'),
        TosBlock(type: 'bullet', text: 'нарушением прав третьих лиц, включая права на персональные данные, в связи с использованием Сервиса Пользователем;'),
        TosBlock(type: 'bullet', text: 'использованием Сервиса в нарушение условий настоящей оферты, включая Раздел 4 (Правила допустимого использования).'),
      ]),
      TosSection(title: '9. Интеллектуальная собственность', blocks: [
        TosBlock(type: 'p', text: '9.1. Исключительные права на программное обеспечение Сервиса, его код, дизайн и товарные знаки принадлежат Поставщику. Настоящая оферта не передаёт Пользователю каких-либо прав на программное обеспечение, кроме права использования в соответствии с выбранным тарифным планом.'),
        TosBlock(type: 'p', text: '9.2. Все данные, документы и материалы, созданные Пользователем в Сервисе, остаются собственностью Пользователя.'),
      ]),
      TosSection(title: '10. Стоимость услуг и порядок оплаты', blocks: [
        TosBlock(type: 'p', text: '10.1. Стоимость использования Сервиса определяется действующими тарифными планами Поставщика, актуальными на дату оплаты.'),
        TosBlock(type: 'p', text: '10.2. Оплата производится в порядке предоплаты за расчётный период, если иное не согласовано сторонами отдельно.'),
        TosBlock(type: 'p', text: '10.3. Поставщик вправе изменять тарифы, уведомив Пользователя не менее чем за 30 дней до вступления изменений в силу.'),
      ]),
      TosSection(title: '11. Срок действия и расторжение', blocks: [
        TosBlock(type: 'p', text: '11.1. Договор действует с момента акцепта оферты до момента его расторжения любой из сторон.'),
        TosBlock(type: 'p', text: '11.2. Пользователь вправе прекратить использование Сервиса в любой момент.'),
        TosBlock(type: 'p', text: '11.3. Поставщик вправе приостановить или прекратить предоставление доступа к Сервису в случае нарушения Пользователем условий настоящей оферты, а также при неоплате использования Сервиса.'),
        TosBlock(type: 'p', text: '11.4. Прекращение действия договора не освобождает стороны от обязательств по Разделам 5, 6, 7 и 8, а также иных положений, которые по своей природе предназначены действовать после прекращения договора — эти разделы сохраняют силу после его прекращения.'),
      ]),
      TosSection(title: '12. Форс-мажор', blocks: [
        TosBlock(type: 'p', text: '12.1. Стороны освобождаются от ответственности за полное или частичное неисполнение обязательств, если это неисполнение явилось следствием обстоятельств непреодолимой силы, включая, помимо прочего: стихийные бедствия, военные действия, действия государственных органов, сбои в работе интернет-инфраструктуры и сторонних облачных сервисов.'),
      ]),
      TosSection(title: '13. Разрешение споров и применимое право', blocks: [
        TosBlock(type: 'p', text: '13.1. К настоящей оферте применяется законодательство Государства Израиль.'),
        TosBlock(type: 'p', text: '13.2. Стороны обязуются приложить усилия для разрешения споров путём переговоров. В случае недостижения согласия спор подлежит рассмотрению в суде по месту нахождения Поставщика, если иное не предусмотрено императивными нормами применимого законодательства.'),
      ]),
      TosSection(title: '14. Заключительные положения', blocks: [
        TosBlock(type: 'p', text: '14.1. Поставщик вправе в одностороннем порядке изменять условия настоящей оферты, уведомив Пользователя путём публикации новой редакции документа. Продолжение использования Сервиса после внесения изменений считается согласием Пользователя с новой редакцией.'),
        TosBlock(type: 'p', text: '14.2. Если какое-либо условие настоящей оферты будет признано недействительным, это не влечёт недействительности остальных условий.'),
      ]),
    ],
  ),
  'he': TosContent(
    title: 'תנאי שימוש',
    subtitle: 'לשימוש בתוכנת Vixor ERP',
    sections: [
      TosSection(title: '1. הגדרות', blocks: [
        TosBlock(type: 'p', text: '"הספק" — בעל הזכויות ומפעיל תוכנת Vixor ERP, המעניק גישה לשירות בהתאם לתנאים אלה.'),
        TosBlock(type: 'p', text: '"המשתמש" / "הארגון" — תאגיד או עוסק שהתקשר בהסכם עם הספק על ידי קבלת תנאים אלה, וקיבל גישה לשירות לשימוש בפעילותו העסקית.'),
        TosBlock(type: 'p', text: '"השירות" — תוכנת Vixor ERP, לרבות פאנל הניהול המקוון, אפליקציית הנייד ותשתית השרתים, המסופקת במודל SaaS (תוכנה כשירות).'),
        TosBlock(type: 'p', text: '"מסמכים" — כל הצעת מחיר, חשבונית, תעודת משלוח, דו"ח, קובץ או מסמך אחר שנוצר, נשמר או מעובד על ידי המשתמש באמצעות השירות.'),
        TosBlock(type: 'p', text: '"לקוחות המשתמש" / "צדדים שלישיים" — לקוחות, ספקים ושותפים של המשתמש, וכן רשויות, מוסדות וארגונים ממשלתיים אליהם מעביר המשתמש מסמכים שנוצרו בשירות.'),
      ]),
      TosSection(title: '2. נושא ההסכם', blocks: [
        TosBlock(type: 'p', text: '2.1. הספק מעניק למשתמש רישיון שאינו בלעדי לשימוש בשירות, בהיקף ולתקופה הנקבעים על פי תוכנית התמחור שנבחרה.'),
        TosBlock(type: 'p', text: '2.2. השירות מספק למשתמש כלים לניהול פעילות עסקית: מעקב קריאות שירות, יצירת הצעות מחיר, חשבוניות ותעודות משלוח, ניהול מלאי ורכבים, סנכרון יומן, ופונקציות נוספות המתוארות בתיעוד השירות.'),
        TosBlock(type: 'p', text: '2.3. הספק פועל אך ורק כמפתח ומפעיל של פלטפורמה טכנית. הספק אינו צד לכל עסקה, הסכם או מערכת יחסים בין המשתמש ללקוחותיו, ואינו מעורב בפעילותו העסקית של המשתמש.'),
      ]),
      TosSection(title: '3. קבלת התנאים', blocks: [
        TosBlock(type: 'p', text: '3.1. תנאים אלה מתקבלים על ידי המשתמש בביצוע אחת מהפעולות הבאות: רישום חשבון, התקנת אפליקציית הנייד, כניסה למערכת באמצעות פרטי הגישה שסופקו, או כל שימוש בפועל בשירות בכל צורה שהיא.'),
        TosBlock(type: 'p', text: '3.2. עם קבלת התנאים, מהווים תנאים אלה הסכם מחייב בין הספק למשתמש בתנאים המפורטים בו.'),
      ]),
      TosSection(title: '4. כללי שימוש מותר', blocks: [
        TosBlock(type: 'p', text: '4.1. אסור למשתמש להשתמש בשירות לצורך: הפרת כל דין; העברת נתונים המפרים זכויות צדדים שלישיים; ניסיון גישה בלתי מורשית לשירות או לתשתיתו; פירוק, הנדסה לאחור או ניסיון לחשוף את קוד המקור של התוכנה; שיתוף פרטי גישה עם מי שאינו עובד הארגון; או פעולה הפוגעת בתפקוד השירות או מטילה עומס בלתי סביר על תשתיתו.'),
        TosBlock(type: 'p', text: '4.2. הספק רשאי להשעות את גישת המשתמש לשירות בעת חשד סביר להפרת סעיף זה, תוך הודעה למשתמש בהזדמנות הראשונה.'),
      ]),
      TosSection(title: '5. אחריות המשתמש', blocks: [
        TosBlock(type: 'p', text: 'האחריות הבלעדית לתוכן, לדיוק ולתוצאות השימוש במסמכים שנוצרו בשירות, מוטלת כולה על המשתמש.', bold: true),
        TosBlock(type: 'p', text: '5.1. המשתמש נושא באחריות מלאה ובלעדית עבור:'),
        TosBlock(type: 'bullet', text: 'נכונותם, שלמותם ודיוקם של כל הנתונים המוזנים לשירות, לרבות נתונים פיננסיים, מחירים, סכומים, פרטים עסקיים, נתוני מס ונתונים על לקוחות המשתמש;'),
        TosBlock(type: 'bullet', text: 'נכונותם וחוקיותם של תוכן כל המסמכים הנוצרים באמצעות השירות, לרבות התאמתם לדרישות דיני המס, החשבונאות וכל דין רלוונטי אחר;'),
        TosBlock(type: 'bullet', text: 'ההחלטה להעביר, לשלוח, להציג או לחשוף מסמכים לכל צד שלישי, לרבות לקוחות המשתמש, ספקים, בנקים, חברות ביטוח, רשויות ממשלתיות, רשויות מס וגופים מפקחים אחרים;'),
        TosBlock(type: 'bullet', text: 'עמידה בכל דין רלוונטי בניהול פעילותו העסקית, לרבות דיני הגנת הצרכן, דיני המס ורגולציה ענפית;'),
        TosBlock(type: 'bullet', text: 'נכונות הגדרות השירות (לרבות תבניות מסמכים, מספור, הגדרות שליחת דוא"ל והגדרות אחסון) ותוצאות השימוש בהגדרות אלה;'),
        TosBlock(type: 'bullet', text: 'שמירת סודיות פרטי הגישה של משתמשי הארגון, וכן כל פעולה שבוצעה תחת פרטי גישה אלה;'),
        TosBlock(type: 'bullet', text: 'ניהול גיבוי עצמאי לנתונים קריטיים לפעילותו, מעבר לאמצעים הסטנדרטיים שנוקט הספק.'),
        TosBlock(type: 'p', text: '5.2. הספק אינו בודק, מאמת או נושא באחריות לתוכן, לדיוק או לתוקף המשפטי של מסמכים שנוצרו על ידי המשתמש. השירות הוא כלי ליצירה ואחסון של מסמכים, ואינו מהווה תחליף לייעוץ חשבונאי, מס או משפטי מקצועי.'),
        TosBlock(type: 'p', text: '5.3. כל טעות, אי-דיוק, מחלוקת או תביעה הנוגעת לתוכן המסמכים או להעברתם לצדדים שלישיים, תיושב אך ורק בין המשתמש לצד השלישי הרלוונטי, ללא מעורבות הספק.'),
      ]),
      TosSection(title: '6. הגבלת אחריות הספק', blocks: [
        TosBlock(type: 'upper', text: 'השירות מסופק על בסיס "כמות שהוא" (AS IS) ו"ככל שיהיה זמין" (AS AVAILABLE), ללא כל אחריות, מפורשת או משתמעת, לרבות אחריות להתאמה למטרה מסוימת, לפעולה רציפה או לאי-קיום תקלות. הספק אינו מתחייב לאחוז זמינות מסוים, אלא אם הוסכם אחרת במפורש בהסכם רמת שירות (SLA) נפרד.'),
        TosBlock(type: 'p', text: '6.1. הספק לא יישא באחריות עבור:'),
        TosBlock(type: 'bullet', text: 'כל נזק ישיר, עקיף, מקרי, עונשי או תוצאתי, לרבות אובדן רווחים, אובדן נתונים או פגיעה במוניטין, הנובע משימוש בשירות או מאי-היכולת להשתמש בו;'),
        TosBlock(type: 'bullet', text: 'תוכן, דיוק ותוצאות השימוש במסמכים שנוצרו על ידי המשתמש (ראו סעיף 5);'),
        TosBlock(type: 'bullet', text: 'פעולות או מחדלים של צדדים שלישיים ושירותי צד שלישי המשולבים בשירות או המשמשים להפעלתו (לרבות, בין היתר: ספקי דוא"ל, Google Calendar, רשתות הפצת תוכן ומעבדי תשלומים);'),
        TosBlock(type: 'bullet', text: 'הפרעות בפעילות השירות הנובעות מתחזוקה, מתקלות בתשתית צד שלישי או מכוח עליון;'),
        TosBlock(type: 'bullet', text: 'אובדן נתונים כתוצאה מפעולות המשתמש עצמו, לרבות מחיקה שנגרמה מניקוי אוטומטי במצב הדגמה (חשבון דמו), ככל שנעשה בו שימוש.'),
        TosBlock(type: 'p', text: '6.2. סך אחריותו הכוללת של הספק כלפי המשתמש, מכל עילה הקשורה לשימוש בשירות, מוגבלת לסכום ששולם בפועל על ידי המשתמש לספק במהלך 12 החודשים שקדמו לאירוע נשוא התביעה.'),
      ]),
      TosSection(title: '7. הגנת מידע ופרטיות', blocks: [
        TosBlock(type: 'p', text: '7.1. בשימוש בשירות, המשתמש מזין ומעבד מידע אישי של צדדים שלישיים (לקוחות המשתמש, עובדים ואחרים). ביחסים אלה, המשתמש פועל כבעל השליטה (controller) על המידע האישי, והספק פועל כמעבד טכני, המספק תשתית לאחסון ועיבוד המידע לפי הוראות המשתמש.'),
        TosBlock(type: 'p', text: '7.2. המשתמש אחראי באופן בלעדי לקיומה של תשתית חוקית לאיסוף ועיבוד המידע האישי של לקוחותיו, לרבות קבלת כל הסכמה נדרשת, ולעמידה בחוק הגנת הפרטיות ובכל דין רלוונטי אחר בתחום הגנת המידע.'),
        TosBlock(type: 'p', text: '7.3. הספק נוקט באמצעים הטכניים והארגוניים הבאים להגנת מידע:'),
        TosBlock(type: 'bullet', text: 'בידוד מלא של נתוני כל ארגון ברמת מסד נתונים נפרד;'),
        TosBlock(type: 'bullet', text: 'הצפנת פרטי גישה מאוחסנים (סיסמאות, מפתחות גישה לדוא"ל ולאחסון חיצוני) וקבצי חיבור מכשירים;'),
        TosBlock(type: 'bullet', text: 'העברת נתונים בפרוטוקול מאובטח (HTTPS/TLS);'),
        TosBlock(type: 'bullet', text: 'בקרת גישה מבוססת תפקידים והרשאות;'),
        TosBlock(type: 'bullet', text: 'האפשרות לנתק מיידית את גישת המכשיר או הארגון דרך מערכת הרישוי המרכזית.'),
        TosBlock(type: 'p', text: '7.4. חרף האמצעים הננקטים, הספק אינו מבטיח הגנה מוחלטת מפני גישה בלתי מורשית, ולא יישא באחריות לתוצאות גישה כאמור, אלא אם נגרמה ברשלנות חמורה או בזדון מצד הספק.'),
        TosBlock(type: 'p', text: '7.5. לבקשת המשתמש, יבצע הספק מחיקה או ייצוא של נתוני הארגון בתוך זמן סביר, למעט נתונים שחובה לשמרם על פי דין.'),
        TosBlock(type: 'p', text: '7.6. במצב הדגמה (חשבון דמו), כל נתוני הארגון נמחקים אוטומטית ובאופן בלתי הפיך בתום תקופת השמירה שהוגדרה (כברירת מחדל — 10 ימים ממועד היצירה). אין להשתמש במצב הדגמה לאחסון נתונים אמיתיים.'),
      ]),
      TosSection(title: '8. שיפוי', blocks: [
        TosBlock(type: 'p', text: '8.1. המשתמש מתחייב לשפות ולהגן על הספק מפני כל תביעה, דרישה, נזק והוצאה (לרבות הוצאות משפטיות סבירות), הנובעים מ:'),
        TosBlock(type: 'bullet', text: 'תוכן מסמכים שנוצרו על ידי המשתמש והעברתם לצדדים שלישיים;'),
        TosBlock(type: 'bullet', text: 'הפרת דין על ידי המשתמש בשימוש בשירות;'),
        TosBlock(type: 'bullet', text: 'פגיעה בזכויות צדדים שלישיים, לרבות זכויות במידע אישי, הנובעת משימוש המשתמש בשירות;'),
        TosBlock(type: 'bullet', text: 'שימוש בשירות בניגוד לתנאים אלה, לרבות סעיף 4 (כללי שימוש מותר).'),
      ]),
      TosSection(title: '9. קניין רוחני', blocks: [
        TosBlock(type: 'p', text: '9.1. כל הזכויות הבלעדיות בתוכנת השירות, בקוד, בעיצוב ובסימני המסחר שייכות לספק. תנאים אלה אינם מעניקים למשתמש כל זכות בתוכנה, מלבד זכות השימוש בהתאם לתוכנית התמחור שנבחרה.'),
        TosBlock(type: 'p', text: '9.2. כל הנתונים, המסמכים והחומרים שנוצרו על ידי המשתמש בשירות נותרים בבעלות המשתמש.'),
      ]),
      TosSection(title: '10. עלות השירות ותנאי תשלום', blocks: [
        TosBlock(type: 'p', text: '10.1. עלות השימוש בשירות נקבעת על פי תוכניות התמחור התקפות של הספק במועד התשלום.'),
        TosBlock(type: 'p', text: '10.2. התשלום מתבצע מראש עבור כל תקופת חיוב, אלא אם הוסכם אחרת בין הצדדים.'),
        TosBlock(type: 'p', text: '10.3. הספק רשאי לשנות את התעריפים בהודעה מוקדמת של 30 יום לפחות לפני כניסת השינוי לתוקף.'),
      ]),
      TosSection(title: '11. תקופה וסיום', blocks: [
        TosBlock(type: 'p', text: '11.1. ההסכם תקף החל ממועד קבלת התנאים ועד לסיומו על ידי מי מהצדדים.'),
        TosBlock(type: 'p', text: '11.2. המשתמש רשאי להפסיק את השימוש בשירות בכל עת.'),
        TosBlock(type: 'p', text: '11.3. הספק רשאי להשעות או לסיים את גישת המשתמש לשירות במקרה של הפרת תנאים אלה או אי-תשלום עבור השירות.'),
        TosBlock(type: 'p', text: '11.4. סיום ההסכם אינו פוטר את הצדדים מהתחייבויותיהם לפי סעיפים 5, 6, 7 ו-8, וכן כל הוראה אחרת שמטבעה נועדה להמשיך ולחול לאחר סיום ההסכם — הוראות אלה ימשיכו לחול לאחר הסיום.'),
      ]),
      TosSection(title: '12. כוח עליון', blocks: [
        TosBlock(type: 'p', text: '12.1. אף צד לא יישא באחריות לאי-ביצוע מלא או חלקי של התחייבויותיו, ככל שנבע מנסיבות שאינן בשליטתו הסבירה, לרבות, בין היתר: אסונות טבע, פעולות מלחמה, פעולות רשויות ממשלתיות, ותקלות בתשתית האינטרנט או בשירותי ענן של צד שלישי.'),
      ]),
      TosSection(title: '13. יישוב סכסוכים ודין חל', blocks: [
        TosBlock(type: 'p', text: '13.1. על תנאים אלה יחול דין מדינת ישראל.'),
        TosBlock(type: 'p', text: '13.2. הצדדים ישאפו ליישב מחלוקות במשא ומתן. במקרה של אי-הסכמה, תובא המחלוקת בפני בית המשפט המוסמך במקום מושבו של הספק, אלא אם הוראה קוגנטית בדין החל קובעת אחרת.'),
      ]),
      TosSection(title: '14. הוראות כלליות', blocks: [
        TosBlock(type: 'p', text: '14.1. הספק רשאי לשנות תנאים אלה באופן חד-צדדי בפרסום גרסה מעודכנת. המשך השימוש בשירות לאחר פרסום השינוי מהווה הסכמת המשתמש לגרסה המעודכנת.'),
        TosBlock(type: 'p', text: '14.2. ככל שהוראה כלשהי בתנאים אלה תימצא בלתי תקפה, אין בכך כדי לפגוע בתוקף שאר ההוראות.'),
      ]),
    ],
  ),
};
