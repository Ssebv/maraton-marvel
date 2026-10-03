// swift-tools-version: 6.0
// Lógica de la app de iOS sin interfaz: catálogo, progreso y bits compatibles
// con la web. Los datos de Sources/MaratonKit/Recursos los genera
// `npm run ios:datos` desde src/ (no se editan aquí).
import PackageDescription

let package = Package(
    name: "MaratonKit",
    defaultLocalization: "es",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "MaratonKit", targets: ["MaratonKit"])],
    targets: [
        .target(name: "MaratonKit", resources: [.copy("Recursos")]),
        .testTarget(name: "MaratonKitTests", dependencies: ["MaratonKit"], resources: [.copy("vectores.json")]),
    ]
)
