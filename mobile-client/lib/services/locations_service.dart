import '../models/location.dart';
import 'api_service.dart';

class LocationsService {
  LocationsService(this._api);
  final ApiService _api;

  Future<List<City>> searchCities(String query, {int? regionId}) async {
    final data = await _api.get('/locations/cities', query: {
      if (query.isNotEmpty) 'q': query,
      if (regionId != null) 'regionId': regionId,
    }) as List;
    return data.map((j) => City.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<List<Location>> searchLocations(String query, {int? cityId}) async {
    final data = await _api.get('/locations', query: {
      if (query.isNotEmpty) 'q': query,
      if (cityId != null) 'cityId': cityId,
    }) as List;
    return data.map((j) => Location.fromJson(j as Map<String, dynamic>)).toList();
  }
}
