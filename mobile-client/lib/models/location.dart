class Region {
  final int id;
  final String name;
  Region({required this.id, required this.name});
  factory Region.fromJson(Map<String, dynamic> json) => Region(id: json['id'], name: json['name']);
}

class City {
  final int id;
  final String name;
  final Region? region;
  City({required this.id, required this.name, this.region});
  factory City.fromJson(Map<String, dynamic> json) => City(
        id: json['id'],
        name: json['name'],
        region: json['region'] != null ? Region.fromJson(json['region']) : null,
      );
}

class Location {
  final int id;
  final String name;
  final City? city;
  Location({required this.id, required this.name, this.city});
  factory Location.fromJson(Map<String, dynamic> json) => Location(
        id: json['id'],
        name: json['name'],
        city: json['city'] != null ? City.fromJson(json['city']) : null,
      );
}
