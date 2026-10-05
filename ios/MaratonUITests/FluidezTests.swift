// Sonda de fluidez: desliza cada pantalla con gestos reales y mide los tirones
// con la métrica de Apple (Hitch Time Ratio, ms de tirón por segundo de scroll:
// < 5 bien, 5–10 se nota, > 10 molesta). Corre en Release, sin las banderas de
// depuración: navega tocando como una persona.
//   xcodebuild test -configuration Release -scheme Maraton -destination … -only-testing:MaratonUITests
import XCTest

final class FluidezTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
        _ = app.tabBars.firstMatch.waitForExistence(timeout: 15)
        sleep(2)
    }

    /// Cinco barridos hacia abajo y cinco de vuelta, rápidos, como al buscar algo.
    /// La ficha y la persona se cierran bajándolas desde arriba (zoom): ahí se
    /// vuelve uno menos para no llegar arriba y medir la pantalla de atrás.
    private func mide(_ nombre: String, cerrable: Bool = false) {
        let opciones = XCTMeasureOptions()
        opciones.iterationCount = 3
        opciones.invocationOptions = [.manuallyStop]
        measure(metrics: [XCTOSSignpostMetric.scrollingAndDecelerationMetric], options: opciones) {
            for _ in 0..<5 { app.swipeUp(velocity: .fast) }
            for _ in 0..<(cerrable ? 4 : 5) { app.swipeDown(velocity: .fast) }
            stopMeasuring()
        }
    }

    /// Por posición: no depende del idioma de la app (0 Inicio, 1 Cronología, 3 Progreso)
    private func pestana(_ indice: Int) {
        app.tabBars.buttons.element(boundBy: indice).tap()
        sleep(1)
    }

    /// El botón «Ficha» del destacado de Inicio, en español o en inglés
    private func abreFicha() {
        app.buttons.matching(NSPredicate(format: "label IN %@", ["Ficha", "Details"])).firstMatch.tap()
        sleep(2)
    }

    func testInicio() { mide("inicio") }

    func testCronologia() {
        pestana(1)
        mide("cronologia")
    }

    func testProgreso() {
        pestana(3)
        mide("progreso")
    }

    func testFicha() {
        abreFicha()
        mide("ficha", cerrable: true)
    }

    func testPersona() {
        abreFicha()
        let persona = app.buttons.matching(identifier: "reparto").firstMatch
        for _ in 0..<6 where !persona.isHittable { app.swipeUp(velocity: .slow) }
        persona.tap()
        sleep(3)
        mide("persona", cerrable: true)
    }
}
