/// Shared photo-capture settings for every scanner entry point, so all of them
/// feed the server the same size/quality that the receipt scanner is tuned for
/// (big enough for OCR and edge detection, small enough not to time out on
/// 100+ MP Android cameras).
class CaptureOptions {
  static const double maxSide = 2800;
  static const int quality = 88;
}
