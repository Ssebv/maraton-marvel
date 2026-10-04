import SwiftUI
import UIKit
import MaratonKit

/// Idioma y país, guardados en el teléfono. Por defecto salen del iPhone:
/// inglés si el sistema está en inglés; títulos de Latinoamérica fuera de España.
@MainActor @Observable
final class Ajustes {
    var idioma: Idioma { didSet { UserDefaults.standard.set(idioma.rawValue, forKey: "idioma") } }
    var pais: String { didSet { UserDefaults.standard.set(pais, forKey: "pais") } }
    /// Sin spoilers, como en la web: esconde sinopsis, post-créditos y títulos de
    /// episodio de lo que aún no has visto
    var sinSpoilers = UserDefaults.standard.bool(forKey: "sinSpoilers") {
        didSet { UserDefaults.standard.set(sinSpoilers, forKey: "sinSpoilers") }
    }

    init(paises: [Pais]) {
        let region = Locale.current.region?.identifier ?? "ES"
        // un país guardado que ya no esté en los datos vuelve al de por defecto
        let existe = { (id: String) in paises.contains { $0.id == id } }
        let guardado = UserDefaults.standard.string(forKey: "pais").flatMap { existe($0) ? $0 : nil }
        pais = guardado ?? (existe(region) ? region : "ES")
        if let i = UserDefaults.standard.string(forKey: "idioma").flatMap(Idioma.init(rawValue:)) {
            idioma = i
        } else if Locale.current.language.languageCode?.identifier == "en" {
            idioma = .en
        } else {
            idioma = region == "ES" ? .es : .latam
        }
    }

    /// Para fechas y nombres de días en el idioma elegido
    var locale: Locale { Locale(identifier: idioma == .en ? "en_US" : idioma == .es ? "es_ES" : "es_CL") }

    /// Para tr(es, en) como en la web
    func tr(_ es: String, _ en: String) -> String { idioma == .en ? en : es }
}

/// Las imágenes del paquete (WebP), decodificadas fuera del hilo principal
/// una vez y guardadas listas para pintar. @unchecked: NSCache es seguro entre hilos.
final class Imagenes: @unchecked Sendable {
    static let compartidas = Imagenes()
    /// Decodificadas pesan mucho más que el WebP (un póster ~0,7 MB): tope de 80 MB
    private let cache: NSCache<NSURL, UIImage> = {
        let c = NSCache<NSURL, UIImage>()
        c.totalCostLimit = 80 << 20
        return c
    }()

    /// La ya preparada, si está (para pintarla en la primera pasada sin parpadeo)
    func enCache(_ url: URL?) -> UIImage? { url.flatMap { cache.object(forKey: $0 as NSURL) } }

    func imagen(_ url: URL) async -> UIImage? {
        if let i = enCache(url) { return i }
        guard let i = await UIImage(contentsOfFile: url.path)?.byPreparingForDisplay() else { return nil }
        cache.setObject(i, forKey: url as NSURL, cost: i.cgImage.map { $0.bytesPerRow * $0.height } ?? 0)
        return i
    }
}

/// Una imagen del paquete que llena su marco; mientras se decodifica, `relleno`
struct ImagenLocal<Relleno: View>: View {
    let url: URL?
    @ViewBuilder var relleno: Relleno
    @State private var cargada: (url: URL, imagen: UIImage)?

    var body: some View {
        // la de la url actual: una celda reciclada no enseña la imagen de otra
        if let img = cargada.flatMap({ $0.url == url ? $0.imagen : nil }) ?? Imagenes.compartidas.enCache(url) {
            Image(uiImage: img).resizable().scaledToFill()
        } else {
            relleno.task(id: url) {
                guard let url, let img = await Imagenes.compartidas.imagen(url) else { return }
                cargada = (url, img)
            }
        }
    }
}

struct Poster: View {
    let url: URL?
    var ancho: CGFloat = 96
    var radio: CGFloat = Tema.radioM

    var body: some View {
        ImagenLocal(url: url) {
            Tema.panel2.overlay(Image(systemName: "film").foregroundStyle(Tema.tinta3))
        }
        .frame(width: ancho, height: ancho * 1.5)
        .clipShape(.rect(cornerRadius: radio))
        .overlay(RoundedRectangle(cornerRadius: radio).strokeBorder(.white.opacity(0.12), lineWidth: 1))
    }
}

/// La casilla de visto: grande para el dedo (44 pt), con háptica al marcar
struct Casilla: View {
    let marcada: Bool
    var color: Color = Tema.rojo
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            Image(systemName: marcada ? "checkmark.circle.fill" : "circle")
                .font(.title2)
                .foregroundStyle(marcada ? color : Tema.tinta3)
                .contentTransition(.symbolEffect(.replace))
                .frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.success, trigger: marcada) { _, nuevo in nuevo }
        .accessibilityLabel(marcada ? "Visto" : "Sin ver")
    }
}

/// Barra de progreso fina con el color de la saga
struct Barra: View {
    let fraccion: Double
    var color: Color = Tema.rojo
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Tema.panel2)
                Capsule().fill(color).frame(width: fraccion <= 0 ? 0 : max(6, g.size.width * min(1, fraccion)))
            }
        }
        .frame(height: 6)
        .animation(.spring(duration: 0.4), value: fraccion)
    }
}

enum Formato {
    static func duracion(_ min: Int) -> String {
        let h = min / 60, m = min % 60
        return h == 0 ? "\(m) min" : m == 0 ? "\(h) h" : "\(h) h \(m) min"
    }

    static func meta(_ t: Titulo, catalogo: Catalogo) -> String {
        var partes: [String] = []
        if let r = t.r { partes.append(String(r)) }
        if t.esSerie {
            let n = catalogo.episodios(de: t.id).count
            if n > 0 { partes.append("\(n) ep.") }
        } else if let d = t.d { partes.append(duracion(d)) }
        if let s = t.s { partes.append(String(format: "★ %.1f", s)) }
        return partes.joined(separator: " · ")
    }
}

#if DEBUG
/// Para capturas: `-ancla estrenos` baja el scroll hasta esa sección al abrir
struct AnclaDepuracion: ViewModifier {
    func body(content: Content) -> some View {
        ScrollViewReader { lector in
            content.task {
                guard let a = UserDefaults.standard.string(forKey: "ancla") else { return }
                try? await Task.sleep(for: .milliseconds(400))
                lector.scrollTo(a, anchor: UnitPoint(x: 0.5, y: 0.1))
            }
        }
    }
}
#endif

extension View {
    /// Marca una sección a la que `-ancla` puede bajar (solo en depuración)
    func ancla(_ id: String) -> some View { self.id(id) }
    @ViewBuilder func conAnclaDepuracion() -> some View {
        #if DEBUG
        modifier(AnclaDepuracion())
        #else
        self
        #endif
    }
}
