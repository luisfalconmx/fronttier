// Prints this Mac's position from Location Services (Wi-Fi/GPS, no Google API
// key) as one JSON line on stdout, then exits. Built by scripts/build.mjs.
import CoreLocation
import Foundation

final class Locator: NSObject, CLLocationManagerDelegate {
  let manager = CLLocationManager()

  func start() {
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyBest
    check(manager.authorizationStatus)
  }

  func check(_ status: CLAuthorizationStatus) {
    switch status {
    case .notDetermined: manager.requestWhenInUseAuthorization()
    case .denied, .restricted: finish(["error": "denied"])
    default: manager.requestLocation()
    }
  }

  func locationManagerDidChangeAuthorization(_ m: CLLocationManager) { check(m.authorizationStatus) }

  func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let l = locations.last else { return }
    finish(["lat": l.coordinate.latitude, "lng": l.coordinate.longitude, "accuracy": l.horizontalAccuracy])
  }

  func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
    if (error as? CLError)?.code == .locationUnknown { return }
    finish(["error": error.localizedDescription])
  }

  func finish(_ out: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: out)
    print(String(data: data, encoding: .utf8)!)
    exit(out["error"] == nil ? 0 : 1)
  }
}

if !CLLocationManager.locationServicesEnabled() {
  print(#"{"error":"disabled"}"#)
  exit(1)
}
let locator = Locator()
locator.start()
DispatchQueue.main.asyncAfter(deadline: .now() + 30) { locator.finish(["error": "timeout"]) }
RunLoop.main.run()
