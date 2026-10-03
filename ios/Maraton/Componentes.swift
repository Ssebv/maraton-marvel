import SwiftUI
import UIKit
import MaratonKit

/// Idioma y país, guardados en el teléfono. Por defecto salen del iPhone:
/// inglés si el sistema está en inglés; títulos de Latinoamérica fuera de España.
@MainActor @Observable
final class Ajustes {
    var idioma: Idioma { didSet { UserDefaults.standard.set(idioma.rawValue, forKey: "idioma") } }
    var pais: String { didSet { UserDefaults.standard.set(pais, forKey: "pais") } }

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

    /// Para tr(es, en) como en la web
    func tr(_ es: String, _ en: String) -> String { idioma == .en ? en : es }
}

/// Las imágenes del paquete (WebP) leídas una vez y guardadas en memoria
final class Imagenes: @unchecked Sendable {
    static let compartidas = Imagenes()
    private let cache = NSCache<NSURL, UIImage>()
    func imagen(_ url: URL?) -> UIImage? {
        guard let url else { return nil }
        if let i = cache.object(forKey: url as NSURL) { return i }
        guard let i = UIImage(contentsOfFile: url.path) else { return nil }
        cache.setObject(i, forKey: url as NSURL)
        return i
    }
}

struct Poster: View {
    let url: URL?
    var ancho: CGFloat = 96
    var radio: CGFloat = Tema.radioM

    var body: some View {
        Group {
            if let img = Imagenes.compartidas.imagen(url) {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Tema.panel2.overlay(Image(systemName: "film").foregroundStyle(Tema.tinta3))
            }
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
