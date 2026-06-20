import 'location.dart';

enum ContactCategory { client, technician, supplier }

ContactCategory categoryFromJson(String v) {
  switch (v) {
    case 'technician':
      return ContactCategory.technician;
    case 'supplier':
      return ContactCategory.supplier;
    default:
      return ContactCategory.client;
  }
}

String categoryToJson(ContactCategory c) {
  switch (c) {
    case ContactCategory.technician:
      return 'technician';
    case ContactCategory.supplier:
      return 'supplier';
    case ContactCategory.client:
      return 'client';
  }
}

class Contact {
  final int id;
  final ContactCategory category;
  final String firstName;
  final String lastName;
  final City? city;
  final Location? organization;
  final String? position;
  final String phone;
  final String? email;
  final String? notes;
  final bool hasPhoto;

  Contact({
    required this.id,
    required this.category,
    required this.firstName,
    required this.lastName,
    this.city,
    this.organization,
    this.position,
    required this.phone,
    this.email,
    this.notes,
    required this.hasPhoto,
  });

  String get fullName => '$firstName $lastName'.trim();

  factory Contact.fromJson(Map<String, dynamic> json) => Contact(
        id: json['id'],
        category: categoryFromJson(json['category']),
        firstName: json['firstName'] ?? '',
        lastName: json['lastName'] ?? '',
        city: json['city'] != null ? City.fromJson(json['city']) : null,
        organization: json['organization'] != null ? Location.fromJson(json['organization']) : null,
        position: json['position'],
        phone: json['phone'] ?? '',
        email: json['email'],
        notes: json['notes'],
        hasPhoto: json['photoRelativePath'] != null,
      );
}
