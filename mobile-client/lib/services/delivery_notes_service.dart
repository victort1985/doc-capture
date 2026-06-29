import '../services/api_service.dart';

class NoteSettings {
  final String? companyName;
  final String? companySubtitle;
  final String? companyAddress;
  final String? companyPhone;
  final String? companyFax;
  final String? companyMobile;
  final String? logoBase64;
  final String? notePrefix;
  final int startingNumber;
  final String? termsText;

  NoteSettings({
    this.companyName,
    this.companySubtitle,
    this.companyAddress,
    this.companyPhone,
    this.companyFax,
    this.companyMobile,
    this.logoBase64,
    this.notePrefix,
    this.startingNumber = 10000,
    this.termsText,
  });

  factory NoteSettings.fromJson(Map<String, dynamic> j) => NoteSettings(
    companyName: j['companyName'],
    companySubtitle: j['companySubtitle'],
    companyAddress: j['companyAddress'],
    companyPhone: j['companyPhone'],
    companyFax: j['companyFax'],
    companyMobile: j['companyMobile'],
    logoBase64: j['logoBase64'],
    notePrefix: j['notePrefix'],
    startingNumber: j['startingNumber'] ?? 10000,
    termsText: j['termsText'],
  );

  static NoteSettings get empty => NoteSettings();
}

class NoteItem {
  final int quantity;
  final String name;
  final String? notes;

  NoteItem({required this.quantity, required this.name, this.notes});

  Map<String, dynamic> toJson() => {
    'quantity': quantity,
    'name': name,
    if (notes != null && notes!.isNotEmpty) 'notes': notes,
  };

  factory NoteItem.fromJson(Map<String, dynamic> j) => NoteItem(
    quantity: j['quantity'] ?? 1,
    name: j['name'] ?? '',
    notes: j['notes'],
  );

  NoteItem copyWith({int? quantity, String? name, String? notes}) =>
    NoteItem(quantity: quantity ?? this.quantity, name: name ?? this.name, notes: notes ?? this.notes);
}

enum DeliveryNoteStatus { draft, signed, cancelled }

class DeliveryNote {
  final int id;
  final String? noteNumber;
  final String? documentType;
  final String? date;
  final String? clientName;
  final String? clientAddress;
  final String? deliveredTo;
  final String? recipientRole;
  final String? recipientIdNumber;
  final List<NoteItem> items;
  final String? remarks;
  final String? lessorSignature;
  final String? lesseeSignature;
  final String? lesseeIdNumber;
  final DeliveryNoteStatus status;
  final String? pdfPath;
  final String? createdByUsername;
  final String createdAt;
  final int? organizationId;

  DeliveryNote({
    required this.id,
    this.noteNumber,
    this.documentType,
    this.date,
    this.clientName,
    this.clientAddress,
    this.deliveredTo,
    this.recipientRole,
    this.recipientIdNumber,
    required this.items,
    this.remarks,
    this.lessorSignature,
    this.lesseeSignature,
    this.lesseeIdNumber,
    required this.status,
    this.pdfPath,
    this.createdByUsername,
    required this.createdAt,
    this.organizationId,
  });

  factory DeliveryNote.fromJson(Map<String, dynamic> j) => DeliveryNote(
    id: j['id'],
    noteNumber: j['noteNumber'],
    documentType: j['documentType'],
    date: j['date'],
    clientName: j['clientName'],
    clientAddress: j['clientAddress'],
    deliveredTo: j['deliveredTo'],
    recipientRole: j['recipientRole'],
    recipientIdNumber: j['recipientIdNumber'],
    items: (j['items'] as List? ?? []).map((i) => NoteItem.fromJson(i as Map<String, dynamic>)).toList(),
    remarks: j['remarks'],
    lessorSignature: j['lessorSignature'],
    lesseeSignature: j['lesseeSignature'],
    lesseeIdNumber: j['lesseeIdNumber'],
    status: j['status'] == 'signed' ? DeliveryNoteStatus.signed : j['status'] == 'cancelled' ? DeliveryNoteStatus.cancelled : DeliveryNoteStatus.draft,
    pdfPath: j['pdfPath'],
    createdByUsername: j['createdBy']?['username'],
    createdAt: j['createdAt'] ?? '',
    organizationId: j['organization']?['id'] as int?,
  );
}

class DeliveryNotesService {
  DeliveryNotesService(this._api);
  final ApiService _api;

  Future<List<DeliveryNote>> list() async {
    final data = await _api.get('/delivery-notes') as List? ?? [];
    return data.map((j) => DeliveryNote.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<DeliveryNote> getOne(int id) async {
    final j = await _api.get('/delivery-notes/$id');
    return DeliveryNote.fromJson(j as Map<String, dynamic>);
  }

  Future<DeliveryNote> create(Map<String, dynamic> dto) async {
    final j = await _api.post('/delivery-notes', dto);
    return DeliveryNote.fromJson(j as Map<String, dynamic>);
  }

  Future<DeliveryNote> update(int id, Map<String, dynamic> dto) async {
    final j = await _api.patch('/delivery-notes/$id', dto);
    return DeliveryNote.fromJson(j as Map<String, dynamic>);
  }

  Future<void> delete(int id) => _api.delete('/delivery-notes/$id');

  Future<List<String>> autocompleteClients(String q) async {
    final data = await _api.get('/delivery-notes/autocomplete/clients', query: {'q': q}) as List? ?? [];
    return data.cast<String>();
  }

  Future<List<String>> autocompleteField(String field, String q) async {
    final data = await _api.get('/delivery-notes/autocomplete/field', query: {'field': field, 'q': q}) as List? ?? [];
    return data.cast<String>();
  }

  Future<String> storePdf(int id, String base64Pdf) async {
    final j = await _api.post('/delivery-notes/$id/pdf', {'pdf': base64Pdf});
    return (j as Map<String, dynamic>)['path'] as String;
  }

  Future<NoteSettings> getSettings({int? orgId}) async {
    try {
      final path = orgId != null ? '/delivery-note-settings?orgId=$orgId' : '/delivery-note-settings';
      final j = await _api.get(path);
      if (j == null) return NoteSettings.empty;
      return NoteSettings.fromJson(j as Map<String, dynamic>);
    } catch (_) {
      return NoteSettings.empty;
    }
  }

  Future<List<Map<String, dynamic>>> getOrganizations() async {
    try {
      final j = await _api.get('/organizations');
      if (j == null) return [];
      return (j as List).cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }
}
