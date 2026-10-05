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
    /// El nombre con el que compartes tu perfil
    var nombrePerfil = UserDefaults.standard.string(forKey: "nombrePerfil") ?? "" {
        didSet { UserDefaults.standard.set(nombrePerfil, forKey: "nombrePerfil") }
    }
    /// Los perfiles de tus rivales (modo duelo): una foto fija de su maratón
    var rivales: [PerfilCompartido] = UserDefaults.standard.data(forKey: "rivales")
        .flatMap { try? JSONDecoder().decode([PerfilCompartido].self, from: $0) } ?? [] {
        didSet { UserDefaults.standard.set(try? JSONEncoder().encode(rivales), forKey: "rivales") }
    }

    /// Un enlace nuevo de quien ya está lo pone al día; otra persona con el
    /// mismo nombre entra numerada (Rivales.agrega)
    func agregaRival(_ p: PerfilCompartido) { rivales = Rivales.agrega(p, a: rivales) }

    /// «Poner al día» desde su página: ocupa su sitio y conserva su nombre
    func reemplazaRival(_ nombre: String, con p: PerfilCompartido) {
        guard let i = rivales.firstIndex(where: { $0.n == nombre }) else { return agregaRival(p) }
        rivales[i] = p.llamado(nombre)
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

/// Las imágenes del paquete (WebP) y las de la red (TMDB, noticias), decodificadas
/// fuera del hilo principal una vez y guardadas listas para pintar. AsyncImage no
/// guarda nada y decodifica en el hilo principal cada vez que una imagen vuelve a
/// la pantalla: al deslizar un carrusel eso eran tirones (medido en el iPhone).
/// @unchecked: NSCache es seguro entre hilos.
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

    @concurrent func imagen(_ url: URL) async -> UIImage? {
        if let i = enCache(url) { return i }
        // la red pasa por la caché de URLSession: volver a una ficha no la descarga otra vez
        let cruda = url.isFileURL ? UIImage(contentsOfFile: url.path)
            : (try? await URLSession.shared.data(from: url)).flatMap { UIImage(data: $0.0) }
        guard let i = await cruda?.byPreparingForDisplay() else { return nil }
        cache.setObject(i, forKey: url as NSURL, cost: i.cgImage.map { $0.bytesPerRow * $0.height } ?? 0)
        return i
    }
}

/// Una imagen (del paquete o de la red) que llena su marco; mientras se
/// prepara, `relleno`. Las de la red aparecen con un fundido.
struct ImagenCacheada<Relleno: View>: View {
    let url: URL?
    @ViewBuilder var relleno: Relleno
    @State private var cargada: (url: URL, imagen: UIImage)?

    var body: some View {
        // la de la url actual: una celda reciclada no enseña la imagen de otra
        if let img = cargada.flatMap({ $0.url == url ? $0.imagen : nil }) ?? Imagenes.compartidas.enCache(url) {
            Image(uiImage: img).resizable().scaledToFill().transition(.opacity)
        } else {
            relleno.task(id: url) {
                guard let url, let img = await Imagenes.compartidas.imagen(url) else { return }
                withAnimation(url.isFileURL ? nil : .easeOut(duration: 0.3)) { cargada = (url, img) }
            }
        }
    }
}

struct Poster: View {
    let url: URL?
    var ancho: CGFloat = 96
    var radio: CGFloat = Tema.radioM

    var body: some View {
        ImagenCacheada(url: url) {
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

/// Un título apilado dentro de la ficha, con la clave de lo que se tocó (su zoom)
struct RutaTitulo: Hashable {
    let titulo: Titulo
    let origen: String?
}

/// Lo que se toca para abrir algo con zoom: la ficha o la persona crecen desde aquí
struct OrigenZoom: ViewModifier {
    let clave: String
    var radio: CGFloat
    @Environment(\.espacioZoom) private var espacio

    func body(content: Content) -> some View {
        if let espacio {
            content.matchedTransitionSource(id: clave, in: espacio) { $0.clipShape(.rect(cornerRadius: radio)) }
        } else {
            content
        }
    }
}

/// Lo que se abre: con clave crece desde su origen y vuelve ahí; sin ella, la transición de siempre
struct ZoomDesde: ViewModifier {
    let clave: String?
    @Environment(\.espacioZoom) private var espacio

    func body(content: Content) -> some View {
        if let clave, let espacio {
            content.navigationTransition(.zoom(sourceID: clave, in: espacio))
        } else {
            content
        }
    }
}

extension View {
    func origenZoom(_ clave: String, radio: CGFloat = Tema.radioM) -> some View { modifier(OrigenZoom(clave: clave, radio: radio)) }
    func zoomDesde(_ clave: String?) -> some View { modifier(ZoomDesde(clave: clave)) }
}

/// Mantener presionado un póster, como en las apps de Apple: vista previa con su
/// fotograma y, debajo, marcar como vista, añadir a una lista y ver la ficha
struct MenuTitulo: ViewModifier {
    let titulo: Titulo
    /// Dentro de la ficha (apilado) «Ver ficha» no hace falta: tocarlo ya la abre encima
    var conVerFicha = true
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    func body(content: Content) -> some View {
        let visto = progreso.visto(titulo.id)
        let comic = catalogo?.saga(de: titulo.id) == "comics"
        content.contextMenu {
            Button {
                withAnimation(.snappy) { progreso.alternar(titulo.id) }
            } label: {
                if visto {
                    Label(ajustes.tr("Marcar pendiente", "Mark as pending"), systemImage: "arrow.uturn.backward")
                } else {
                    Label(comic ? ajustes.tr("Marcar como leído", "Mark as read") : ajustes.tr("Marcar como vista", "Mark as seen"),
                          systemImage: "checkmark.circle")
                }
            }
            if !progreso.listas.isEmpty {
                Menu {
                    ForEach(progreso.listas) { l in
                        Toggle(l.nombre, isOn: Binding(get: { l.items.contains(titulo.id) },
                                                       set: { _ in progreso.alternar(titulo.id, enLista: l.id) }))
                    }
                } label: {
                    Label(ajustes.tr("Tus listas", "Your lists"), systemImage: "bookmark")
                }
            }
            if conVerFicha {
                Button { nav.abre(titulo) } label: { Label(ajustes.tr("Ver ficha", "View details"), systemImage: "info.circle") }
            }
        } preview: {
            if let catalogo { VistaPrevia(titulo: titulo, catalogo: catalogo, idioma: ajustes.idioma, visto: visto) }
        }
    }
}

/// La vista previa del menú: fotograma, título, datos y el resumen (la vista
/// previa no hereda el entorno: todo llega por parámetro)
private struct VistaPrevia: View {
    let titulo: Titulo
    let catalogo: Catalogo
    let idioma: Idioma
    let visto: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Fotograma(remota: catalogo.urlFotograma(titulo.id), local: catalogo.urlPoster(titulo.id),
                      color: Tema.color(saga: catalogo.saga(de: titulo.id)))
                .frame(height: 170)
            VStack(alignment: .leading, spacing: 6) {
                Text(catalogo.nombre(titulo, en: idioma)).font(.headline).foregroundStyle(Tema.tinta)
                HStack(spacing: 6) {
                    Text(Formato.meta(titulo, catalogo: catalogo))
                    if visto { Text("· ✓").foregroundStyle(Tema.verde).bold() }
                }
                .font(.footnote).foregroundStyle(Tema.tinta2)
                if let res = catalogo.texto(titulo.res, en: idioma) {
                    Text(res).font(.subheadline).foregroundStyle(Tema.tinta).lineLimit(3)
                }
            }
            .padding(14)
        }
        .frame(width: 320)
        .background(Tema.panel)
    }
}

extension View {
    func menuTitulo(_ t: Titulo, conVerFicha: Bool = true) -> some View { modifier(MenuTitulo(titulo: t, conVerFicha: conVerFicha)) }

    /// Cabecera que se estira al tirar hacia abajo desde arriba del todo
    func estirable() -> some View {
        visualEffect { contenido, g in
            let y = max(0, g.frame(in: .scrollView).minY)
            return contenido.scaleEffect(1 + y / max(g.size.height, 1), anchor: .bottom)
        }
    }
}
