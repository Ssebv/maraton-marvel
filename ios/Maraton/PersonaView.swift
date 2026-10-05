// La página de cada persona del reparto o la dirección, como FichaPersona de
// la web: quién es, a quién interpreta, su carrera y, lo que ninguna web
// tiene, dónde más sale dentro de tu maratón (y cuántos de esos llevas). Se
// abre desde la ficha creciendo desde su foto (con «volver»), y sus títulos
// abren su ficha encima.
import SwiftUI
import MaratonKit

/// A quién se abre: el nombre tal como está en data.js y desde qué título
struct RutaPersona: Hashable {
    let nombre: String
    let esDireccion: Bool
    let desde: String?
    /// La clave de lo que se tocó (su foto en el reparto): crece desde ahí
    var origen: String?
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

    @State private var nombreEnBarra = false

    var body: some View {
        if let catalogo {
            let titulos = catalogo.titulos(dePersona: ruta.nombre, enTMDB: datos?.enMaraton ?? [])
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    cabecera(catalogo, titulos)
                    VStack(alignment: .leading, spacing: 24) {
                        cifras(titulos)
                        primeraVez(catalogo, titulos)
                        biografia
                        // sin el título del que vienes (como tambienEn de la web); las cifras sí lo cuentan
                        let otros = titulos.filter { $0.id != ruta.desde }
                        if !otros.isEmpty { enTuMaraton(catalogo, otros).ancla("maraton") }
                        if let c = datos?.carrera.conocido, !c.isEmpty { conocido(c).ancla("conocido") }
                        if let url = urlIMDb {
                            Link(destination: url) {
                                Label(ajustes.tr("Su ficha completa en IMDb", "Full profile on IMDb"), systemImage: "arrow.up.right")
                                    .font(.subheadline.weight(.semibold))
                            }
                            .buttonStyle(.glass)
                            .buttonBorderShape(.capsule)
                            .tint(Tema.tinta)
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, 28)
                }
            }
            .conAnclaDepuracion()
            .background(Tema.fondo)
            // su nombre sube a la barra al pasar la cabecera
            .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top > 260 } action: { _, pasado in
                withAnimation(.easeOut(duration: 0.2)) { nombreEnBarra = pasado }
            }
            .ignoresSafeArea(edges: .top)
            .navigationTitle(nombreEnBarra ? ruta.nombre : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.visible, for: .navigationBar)
            .toolbar {
                if let url = urlIMDb {
                    ToolbarItem(placement: .topBarTrailing) {
                        ShareLink(item: url) { Image(systemName: "square.and.arrow.up").foregroundStyle(Tema.tinta) }
                            .accessibilityLabel(ajustes.tr("Compartir", "Share"))
                    }
                }
            }
            .task(id: ajustes.idioma) { await carga(catalogo) }
        }
    }

    private var urlIMDb: URL? { datos?.imdb.flatMap { URL(string: "https://www.imdb.com/name/\($0)/") } }

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

    /// El fotograma del título del que vienes, desenfocado y fundido con el fondo;
    /// encima, su foto grande al centro, el nombre, su papel y de dónde es
    private func cabecera(_ catalogo: Catalogo, _ titulos: [Titulo]) -> some View {
        let fondo = (ruta.desde ?? titulos.first?.id).flatMap { catalogo.urlFotograma($0) }
        return VStack(spacing: 10) {
            Group {
                if let local = catalogo.urlFoto(persona: ruta.nombre) {
                    ImagenLocal(url: local) { Tema.panel2 }
                } else {
                    AsyncImage(url: datos?.foto.flatMap { URL(string: "https://image.tmdb.org/t/p/w342\($0)") }) { i in
                        i.resizable().scaledToFill()
                    } placeholder: {
                        Tema.panel2.overlay(Image(systemName: "person.fill").font(.largeTitle).foregroundStyle(Tema.tinta3))
                    }
                }
            }
            .frame(width: 150, height: 150)
            .clipShape(.circle)
            .padding(5)
            .glassEffect(.regular, in: .circle)
            .shadow(color: .black.opacity(0.35), radius: 18, y: 10)
            .accessibilityHidden(true)
            .padding(.bottom, 6)
            Text(ruta.nombre)
                .font(.largeTitle.weight(.heavy))
                .foregroundStyle(Tema.tinta)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
            if let papel = ruta.desde.flatMap({ datos?.papeles[$0] }) {
                (Text(ajustes.tr("Interpreta a ", "Plays ")) + Text(catalogo.personaje(papel, en: ajustes.idioma)).bold())
                    .font(.headline.weight(.regular)).foregroundStyle(Tema.tinta)
                    .multilineTextAlignment(.center)
            } else {
                Text(ruta.esDireccion ? ajustes.tr("Dirección", "Director") : ajustes.tr("Reparto", "Cast"))
                    .font(.headline.weight(.regular)).foregroundStyle(Tema.tinta2)
            }
            if let d = datos, d.nacimiento != nil || d.lugar != nil {
                Text([d.nacimiento.flatMap(fecha), d.lugar].compactMap { $0 }.joined(separator: " · "))
                    .font(.footnote).foregroundStyle(Tema.tinta2)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.top, 110)
        .background(alignment: .top) {
            Fotograma(remota: fondo, color: Tema.oro)
                .frame(height: 300)
                .blur(radius: 14)
                .overlay {
                    LinearGradient(stops: [.init(color: Tema.fondo.opacity(0.1), location: 0),
                                           .init(color: Tema.fondo.opacity(0.55), location: 0.6),
                                           .init(color: Tema.fondo, location: 1)],
                                   startPoint: .top, endPoint: .bottom)
                }
                .clipped()
        }
    }

    /// Sus cifras, con la misma tira que la ficha
    @ViewBuilder
    private func cifras(_ titulos: [Titulo]) -> some View {
        let d = datos
        let edad = d?.edad()
        if let d, edad != nil || d.carrera.desde != nil || titulos.count > 1 {
            HStack(alignment: .top, spacing: 0) {
                let celdas: [(String, String)] = [
                    edad.map { ("\($0)", d.muerte != nil ? ajustes.tr("Años al morir", "At death") : ajustes.tr("Años", "Age")) },
                    d.carrera.desde.map { (String($0), ajustes.tr("Empezó", "Since")) },
                    d.carrera.creditos > 0 ? ("\(d.carrera.creditos)", ajustes.tr("Créditos", "Credits")) : nil,
                    titulos.count > 1 ? ("\(titulos.count)", ajustes.tr("Maratón", "Marathon")) : nil,
                ].compactMap { $0 }
                ForEach(Array(celdas.enumerated()), id: \.offset) { i, c in
                    if i > 0 { Rectangle().fill(Tema.linea).frame(width: 1, height: 36).padding(.top, 4) }
                    VStack(spacing: 4) {
                        Text(c.1.uppercased())
                            .font(.caption2.weight(.bold)).tracking(0.8)
                            .foregroundStyle(Tema.tinta3)
                            .lineLimit(1).minimumScaleFactor(0.8)
                        Text(c.0).font(.title3.weight(.bold).monospacedDigit()).foregroundStyle(Tema.tinta)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.vertical, 14)
            .padding(.horizontal, 6)
            .superficie(radio: Tema.radioL)
        }
    }

    /// Su debut en el maratón, con su póster (abre su ficha salvo que vengas de ella)
    @ViewBuilder
    private func primeraVez(_ catalogo: Catalogo, _ titulos: [Titulo]) -> some View {
        if titulos.count > 1, let p = titulos.filter({ $0.r != nil }).min(by: { $0.r! < $1.r! }) {
            let clave = "primera:\(ruta.nombre):\(p.id)"
            let tarjeta = HStack(spacing: 14) {
                Poster(url: catalogo.urlPoster(p.id, idioma: ajustes.idioma), ancho: 52, radio: Tema.radioS + 2)
                    .origenZoom(clave, radio: Tema.radioS + 2)
                VStack(alignment: .leading, spacing: 4) {
                    Rotulo(texto: ajustes.tr("Su debut en el maratón", "Marathon debut"), color: Tema.oro)
                    Text(catalogo.nombre(p, en: ajustes.idioma)).font(.headline).foregroundStyle(Tema.tinta)
                        .multilineTextAlignment(.leading)
                    let como = datos?.papeles[p.id].map { catalogo.personaje($0, en: ajustes.idioma) }
                    Text([p.r.map(String.init), como.map { ajustes.tr("como \($0)", "as \($0)") }].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline).foregroundStyle(Tema.tinta2)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                if p.id != ruta.desde {
                    Image(systemName: "chevron.right").font(.footnote.weight(.bold)).foregroundStyle(Tema.tinta3)
                }
            }
            .padding(14)
            .superficie(radio: Tema.radioL)
            .contentShape(.rect)
            if p.id == ruta.desde {
                tarjeta
            } else {
                NavigationLink(value: RutaTitulo(titulo: p, origen: clave)) { tarjeta }
                    .buttonStyle(.plain)
                    .accessibilityHint(ajustes.tr("Abre su ficha", "Opens its page"))
            }
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
                    .tint(Tema.tinta)
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
            let vistos = titulos.filter { progreso.visto($0.id) }.count
            HStack(alignment: .firstTextBaseline) {
                Rotulo(texto: ruta.desde == nil ? ajustes.tr("En tu maratón", "In your marathon")
                                                : ajustes.tr("También en tu maratón", "Also in your marathon"))
                Spacer()
                Text(ajustes.tr("\(vistos) de \(titulos.count) vistos", "\(vistos) of \(titulos.count) seen"))
                    .font(.footnote.monospacedDigit()).foregroundStyle(Tema.tinta2)
                    .contentTransition(.numericText(value: Double(vistos)))
            }
            Barra(fraccion: Double(vistos) / Double(titulos.count), color: Tema.oro)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 14) {
                    ForEach(titulos) { t in
                        NavigationLink(value: RutaTitulo(titulo: t, origen: "persona:\(ruta.nombre):\(t.id)")) {
                            VStack(alignment: .leading, spacing: 4) {
                                Poster(url: catalogo.urlPoster(t.id, idioma: ajustes.idioma), ancho: 96, radio: Tema.radioM)
                                    .origenZoom("persona:\(ruta.nombre):\(t.id)")
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
