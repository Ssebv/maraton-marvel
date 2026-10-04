// La página de cada persona del reparto o la dirección, como FichaPersona de
// la web: quién es, a quién interpreta, su carrera y, lo que ninguna web
// tiene, dónde más sale dentro de tu maratón. Se abre desde la ficha, dentro
// de la misma hoja (con «volver»), y sus títulos abren su ficha encima.
import SwiftUI
import MaratonKit

/// A quién se abre: el nombre tal como está en data.js y desde qué título
struct RutaPersona: Hashable {
    let nombre: String
    let esDireccion: Bool
    let desde: String?
}

struct PersonaView: View {
    let ruta: RutaPersona
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @State private var estado: Estado = .cargando
    @State private var bioEntera = false

    enum Estado: Equatable { case cargando, listo(DatosPersona), sinFicha, sinRed }

    private var datos: DatosPersona? { if case let .listo(d) = estado { d } else { nil } }

    var body: some View {
        if let catalogo {
            let titulos = catalogo.titulos(dePersona: ruta.nombre, enTMDB: datos?.enMaraton ?? [])
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    cabecera(catalogo)
                    cifras(titulos)
                    primeraVez(catalogo, titulos)
                    biografia
                    // sin el título del que vienes (como tambienEn de la web); las cifras sí lo cuentan
                    let otros = titulos.filter { $0.id != ruta.desde }
                    if !otros.isEmpty { enTuMaraton(catalogo, otros) }
                    if let c = datos?.carrera.conocido, !c.isEmpty { conocido(c).ancla("conocido") }
                    if let imdb = datos?.imdb, let url = URL(string: "https://www.imdb.com/name/\(imdb)/") {
                        Link(destination: url) {
                            Label(ajustes.tr("Su ficha completa en IMDb", "Full profile on IMDb"), systemImage: "arrow.up.right.square")
                                .font(.subheadline.weight(.semibold))
                        }
                        .buttonStyle(.bordered)
                        .buttonBorderShape(.capsule)
                    }
                }
                .padding(20)
            }
            .conAnclaDepuracion()
            .background(Tema.fondo)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.visible, for: .navigationBar)
            .task(id: ajustes.idioma) { await carga(catalogo) }
        }
    }

    private func carga(_ catalogo: Catalogo) async {
        guard let clave = catalogo.claveTMDB else { estado = .sinFicha; return }
        let idioma = ajustes.idioma == .en ? "en-US" : "es-ES"
        do {
            guard let id = try await CargaPersonas.compartida.id(de: ruta.nombre, clave: clave, inverso: catalogo.tmdbInverso) else {
                estado = .sinFicha; return
            }
            estado = .listo(try await CargaPersonas.compartida.datos(id, idioma: idioma, clave: clave, inverso: catalogo.tmdbInverso))
        } catch {
            if datos == nil { estado = .sinRed }
        }
    }

    // MARK: Partes

    private func cabecera(_ catalogo: Catalogo) -> some View {
        HStack(spacing: 16) {
            Group {
                if let local = catalogo.urlFoto(persona: ruta.nombre) {
                    ImagenLocal(url: local) { Tema.panel2 }
                } else {
                    AsyncImage(url: datos?.foto.flatMap { URL(string: "https://image.tmdb.org/t/p/w185\($0)") }) { i in
                        i.resizable().scaledToFill()
                    } placeholder: {
                        Tema.panel2.overlay(Image(systemName: "person.fill").font(.title).foregroundStyle(Tema.tinta3))
                    }
                }
            }
            .frame(width: 104, height: 104)
            .clipShape(.circle)
            .overlay(Circle().strokeBorder(Tema.oro.opacity(0.7), lineWidth: 2.5))
            .shadow(color: .black.opacity(0.3), radius: 10, y: 6)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(ruta.nombre).font(.title2.weight(.bold)).foregroundStyle(Tema.tinta)
                if let papel = ruta.desde.flatMap({ datos?.papeles[$0] }) {
                    (Text(ajustes.tr("Interpreta a ", "Plays ")) + Text(catalogo.personaje(papel, en: ajustes.idioma)).bold())
                        .font(.subheadline).foregroundStyle(Tema.tinta)
                } else {
                    Text(ruta.esDireccion ? ajustes.tr("Dirección", "Director") : ajustes.tr("Reparto", "Cast"))
                        .font(.subheadline).foregroundStyle(Tema.tinta2)
                }
                if let d = datos, d.nacimiento != nil || d.lugar != nil {
                    Text([d.nacimiento.flatMap(fecha), d.lugar].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Tema.tinta2)
                }
            }
        }
    }

    @ViewBuilder
    private func cifras(_ titulos: [Titulo]) -> some View {
        let d = datos
        let edad = d?.edad()
        if let d, edad != nil || d.carrera.desde != nil || titulos.count > 1 {
            HStack(alignment: .top, spacing: 0) {
                if let edad { cifra("\(edad)", d.muerte != nil ? ajustes.tr("años al morir", "at death") : ajustes.tr("años", "years old")) }
                if let desde = d.carrera.desde { cifra(String(desde), ajustes.tr("empezó", "first credit")) }
                if d.carrera.creditos > 0 { cifra("\(d.carrera.creditos)", ajustes.tr("créditos", "credits")) }
                if titulos.count > 1 { cifra("\(titulos.count)", ajustes.tr("en el maratón", "in the marathon")) }
            }
            .padding(.vertical, 14)
            .superficie(radio: Tema.radioL)
        }
    }

    private func cifra(_ valor: String, _ texto: String) -> some View {
        VStack(spacing: 2) {
            Text(valor).font(.title3.weight(.bold).monospacedDigit()).foregroundStyle(Tema.oro)
            Text(texto).font(.caption).foregroundStyle(Tema.tinta2)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func primeraVez(_ catalogo: Catalogo, _ titulos: [Titulo]) -> some View {
        if titulos.count > 1, let p = titulos.filter({ $0.r != nil }).min(by: { $0.r! < $1.r! }) {
            let nombre = catalogo.nombre(p, en: ajustes.idioma)
            let anio = nombre.contains(String(p.r!)) ? "" : " (\(p.r!))"
            let como = datos?.papeles[p.id].map { ajustes.tr(", como \(catalogo.personaje($0, en: ajustes.idioma))", ", as \($0)") } ?? ""
            (Text(ajustes.tr("Su primera vez en el maratón: ", "First time in the marathon: ")) + Text(nombre + anio).bold() + Text(como))
                .font(.subheadline).foregroundStyle(Tema.tinta)
        }
    }

    @ViewBuilder
    private var biografia: some View {
        switch estado {
        case .cargando:
            HStack(spacing: 10) { ProgressView(); Text(ajustes.tr("Cargando su biografía…", "Loading their biography…")) }
                .font(.subheadline).foregroundStyle(Tema.tinta2)
        case .sinFicha:
            Text(ajustes.tr("No hay ficha de esta persona en TMDB.", "TMDB has no page for this person."))
                .font(.subheadline).foregroundStyle(Tema.tinta2)
        case .sinRed:
            Text(ajustes.tr("No se pudo cargar su biografía. Comprueba tu conexión.", "Could not load their biography. Check your connection."))
                .font(.subheadline).foregroundStyle(Tema.tinta2)
        case let .listo(d) where d.bio.isEmpty:
            Text(ajustes.tr("TMDB no tiene biografía en español de esta persona.", "TMDB has no biography for this person."))
                .font(.subheadline).foregroundStyle(Tema.tinta2)
        case let .listo(d):
            VStack(alignment: .leading, spacing: 8) {
                Text(bioEntera || d.bio.count <= 420 ? d.bio : corta(d.bio))
                    .font(.body).foregroundStyle(Tema.tinta)
                if d.bio.count > 420 {
                    Button(bioEntera ? ajustes.tr("Menos", "Less") : ajustes.tr("Leer más", "Read more")) {
                        withAnimation(.snappy) { bioEntera.toggle() }
                    }
                    .font(.subheadline.weight(.semibold))
                }
                if d.bioFuente == "wikipedia" {
                    HStack(spacing: 4) {
                        Text(ajustes.tr("Fuente: Wikipedia", "Source: Wikipedia"))
                        if let u = d.bioUrl.flatMap(URL.init(string:)) {
                            Text("·")
                            Link(ajustes.tr("artículo completo", "full article"), destination: u)
                        }
                    }
                    .font(.caption).foregroundStyle(Tema.tinta2)
                } else if d.bioFuente == "tmdb-en" {
                    Text(ajustes.tr("Biografía en inglés: TMDB no la tiene en español.", "Biography from TMDB."))
                        .font(.caption).foregroundStyle(Tema.tinta2)
                }
            }
        }
    }

    private func enTuMaraton(_ catalogo: Catalogo, _ titulos: [Titulo]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Rotulo(texto: ruta.desde == nil ? ajustes.tr("En tu maratón (\(titulos.count))", "In your marathon (\(titulos.count))")
                                            : ajustes.tr("También en tu maratón (\(titulos.count))", "Also in your marathon (\(titulos.count))"))
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 14) {
                    ForEach(titulos) { t in
                        NavigationLink(value: t) {
                            VStack(alignment: .leading, spacing: 4) {
                                Poster(url: catalogo.urlPoster(t.id, idioma: ajustes.idioma), ancho: 96, radio: Tema.radioM)
                                    .overlay(alignment: .topTrailing) {
                                        if progreso.visto(t.id) {
                                            Image(systemName: "checkmark.circle.fill").font(.title3)
                                                .foregroundStyle(.white, Tema.verde).padding(5)
                                        }
                                    }
                                Text(catalogo.nombre(t, en: ajustes.idioma)).font(.caption.weight(.semibold))
                                    .foregroundStyle(Tema.tinta).lineLimit(2)
                                Text(datos?.papeles[t.id].map { catalogo.personaje($0, en: ajustes.idioma) } ?? t.r.map(String.init) ?? "")
                                    .font(.caption2).foregroundStyle(Tema.tinta2).lineLimit(2)
                            }
                            .frame(width: 96)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .scrollIndicators(.hidden)
            // a sangre: el carrusel llega al borde y su contenido empieza en el margen
            .contentMargins(.horizontal, 20, for: .scrollContent)
            .padding(.horizontal, -20)
        }
    }

    private func conocido(_ lista: [DatosPersona.Conocido]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Rotulo(texto: ajustes.tr("Conocido también por", "Also known for"))
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 14) {
                    ForEach(lista, id: \.self) { x in
                        VStack(alignment: .leading, spacing: 4) {
                            AsyncImage(url: URL(string: "https://image.tmdb.org/t/p/w185\(x.p)")) { i in
                                i.resizable().scaledToFill()
                            } placeholder: {
                                Tema.panel2.overlay(Image(systemName: "film").foregroundStyle(Tema.tinta3))
                            }
                            .frame(width: 84, height: 126)
                            .clipShape(.rect(cornerRadius: Tema.radioM))
                            Text(x.t).font(.caption.weight(.semibold)).foregroundStyle(Tema.tinta).lineLimit(2)
                            Text([x.a.map(String.init), x.papel.isEmpty ? nil : x.papel].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption2).foregroundStyle(Tema.tinta2).lineLimit(2)
                        }
                        .frame(width: 84)
                    }
                }
            }
            .scrollIndicators(.hidden)
            // a sangre: el carrusel llega al borde y su contenido empieza en el margen
            .contentMargins(.horizontal, 20, for: .scrollContent)
            .padding(.horizontal, -20)
        }
    }

    // MARK: Formato

    private func corta(_ s: String) -> String {
        let t = String(s.prefix(420))
        return (t.range(of: #"\s+\S*$"#, options: .regularExpression).map { String(t[..<$0.lowerBound]) } ?? t) + "…"
    }

    private func fecha(_ texto: String) -> String? {
        guard let d = Fecha.dia(texto) else { return nil }
        return d.formatted(.dateTime.day().month(.wide).year().locale(ajustes.locale))
    }
}

enum Fecha {
    /// «1968-10-12» a medianoche local
    static func dia(_ texto: String) -> Date? { Catalogo.dia(texto) }
}

/// TMDB (y la Wikipedia si no hay biografía), con caché en disco de 30 días
/// por persona e idioma, como cargaPersona de la web. Un fallo de red no se
/// guarda: la próxima vez se vuelve a intentar.
actor CargaPersonas {
    static let compartida = CargaPersonas()
    private var ids: [String: Int?] = [:]
    private var memoria: [String: DatosPersona] = [:]
    enum Fallo: Error { case red }

    private struct Guardado: Codable { let t: Date; let d: DatosPersona }

    /// El id de TMDB de un nombre; nil = TMDB no tiene a nadie así
    func id(de nombre: String, clave: String, inverso: [String: String]) async throws -> Int? {
        if let id = ids[nombre] { return id }
        let j = try await pide("/search/person", ["query": nombre], idioma: "es-ES", clave: clave)
        let id = Personas.elige((j["results"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }, nombre: nombre, inverso: inverso)
        ids[nombre] = id
        return id
    }

    func datos(_ id: Int, idioma: String, clave: String, inverso: [String: String]) async throws -> DatosPersona {
        let k = "\(idioma)-\(id)"
        if let d = memoria[k] { return d }
        // la versión en el nombre: al cambiar qué se guarda, lo viejo no se lee
        let archivo = Self.carpeta?.appendingPathComponent("v1-\(k).json")
        if let archivo, let g = try? JSONDecoder().decode(Guardado.self, from: Data(contentsOf: archivo)),
           Date().timeIntervalSince(g.t) < 30 * 86400 {
            memoria[k] = g.d
            return g.d
        }
        let j = try await pide("/person/\(id)", ["append_to_response": "combined_credits"], idioma: idioma, clave: clave)
        var d = DatosPersona.lee(j, inverso: inverso)
        var incompleto = false
        if d.bio.isEmpty {
            // la Wikipedia, solo si el artículo es de alguien del oficio (no un homónimo)
            do {
                if let (texto, url) = try await wikipedia(j["name"] as? String ?? "", en: idioma == "en-US" ? "en" : "es") {
                    d.bio = texto; d.bioFuente = "wikipedia"; d.bioUrl = url
                }
            } catch { incompleto = true }
            if d.bio.isEmpty && idioma != "en-US" {
                do {
                    let e = try await pide("/person/\(id)", [:], idioma: "en-US", clave: clave)
                    if let b = (e["biography"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !b.isEmpty {
                        d.bio = b; d.bioFuente = "tmdb-en"
                    }
                } catch { incompleto = true }
            }
        }
        guard !incompleto else { return d }
        memoria[k] = d
        if let archivo {
            try? FileManager.default.createDirectory(at: archivo.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? JSONEncoder().encode(Guardado(t: Date(), d: d)).write(to: archivo, options: .atomic)
        }
        return d
    }

    private static var carpeta: URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.appendingPathComponent("personas")
    }

    private func pide(_ ruta: String, _ q: [String: String], idioma: String, clave: String) async throws -> [String: Any] {
        var c = URLComponents(string: "https://api.themoviedb.org/3\(ruta)")!
        c.queryItems = [URLQueryItem(name: "api_key", value: clave), URLQueryItem(name: "language", value: idioma)]
            + q.map { URLQueryItem(name: $0.key, value: $0.value) }
        guard let url = c.url else { throw Fallo.red }
        let (datos, r) = try await URLSession.shared.data(from: url)
        guard (r as? HTTPURLResponse)?.statusCode == 200,
              let j = try JSONSerialization.jsonObject(with: datos) as? [String: Any] else { throw Fallo.red }
        return j
    }

    /// (texto, enlace) del resumen; nil si no hay artículo del oficio; lanza si falla la red
    private func wikipedia(_ nombre: String, en lengua: String) async throws -> (String, String?)? {
        let titulo = nombre.replacingOccurrences(of: " ", with: "_")
            .addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? nombre
        guard !nombre.isEmpty, let url = URL(string: "https://\(lengua).wikipedia.org/api/rest_v1/page/summary/\(titulo)") else { return nil }
        var pet = URLRequest(url: url)
        pet.timeoutInterval = 6
        let (datos, r) = try await URLSession.shared.data(for: pet)
        let estado = (r as? HTTPURLResponse)?.statusCode ?? 0
        if estado == 404 { return nil }
        guard estado == 200, let w = try JSONSerialization.jsonObject(with: datos) as? [String: Any] else { throw Fallo.red }
        guard w["type"] as? String == "standard",
              let texto = (w["extract"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              Personas.esDelOficio(descripcion: w["description"] as? String ?? "", texto: texto) else { return nil }
        let enlace = ((w["content_urls"] as? [String: Any])?["mobile"] as? [String: Any])?["page"] as? String
        return (texto, enlace)
    }
}
