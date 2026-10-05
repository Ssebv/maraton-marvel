import SwiftUI
import UniformTypeIdentifiers
import MaratonKit

/// La ficha de un título: el fotograma con su título, las acciones (marcar,
/// tráiler, listas), la tira de datos, historia, post-créditos (tapados hasta
/// tocarlos), episodios, reparto, cambios de actor, extras y su lugar en la saga
struct FichaView: View {
    let titulo: Titulo
    /// Abierta desde la página de una persona: con barra para volver
    var apilada = false
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(\.openURL) private var abrirURL
    @Environment(Navegacion.self) private var nav
    @State private var verPostCreditos = false
    @State private var buscandoTrailer = false
    @State private var sinTrailer = false
    /// Sin spoilers: mostrar de todos modos, solo en esta ficha
    @State private var revela = false
    /// La historia larga desplegada
    @State private var historiaEntera = false
    /// Pasado el fotograma, el título sube a la barra (como en las apps de Apple)
    @State private var tituloEnBarra = false

    var body: some View {
        if let catalogo {
            let color = Tema.color(saga: catalogo.saga(de: titulo.id))
            let detalle = catalogo.detalle(titulo.id, en: ajustes.idioma)
            let oculto = ajustes.sinSpoilers && !progreso.visto(titulo.id) && !revela
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    heroe(catalogo, color: color)
                    VStack(alignment: .leading, spacing: 24) {
                        acciones(catalogo, color: color)
                        datos(catalogo, oculto: oculto)
                        if oculto {
                            if titulo.res != nil || titulo.pc != nil || detalle?.larga != nil
                                || (titulo.esSerie && !catalogo.episodios(de: titulo.id).isEmpty) { avisoSpoilers }
                        } else {
                            sinopsis(catalogo, larga: detalle?.larga)
                            postCreditos(catalogo, detalle: detalle)
                        }
                        if let n = catalogo.texto(titulo.n, en: ajustes.idioma) {
                            Bloque(titulo: ajustes.tr("Antes de verla", "Before watching"), icono: "lightbulb") { Text(n) }
                        }
                        if catalogo.saga(de: titulo.id) == "comics" { LeerAqui(titulo: titulo) }
                        TuValoracion(id: titulo.id, vista: progreso.visto(titulo.id))
                        if titulo.esSerie && !catalogo.episodios(de: titulo.id).isEmpty {
                            Episodios(titulo: titulo, color: color, oculto: oculto)
                        }
                        reparto(catalogo).ancla("reparto")
                        if let cambios = detalle?.cambios, !cambios.isEmpty {
                            Bloque(titulo: ajustes.tr("Cambios de actor", "Recasts"), icono: "person.2") {
                                ForEach(cambios, id: \.self) { c in
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(c.p).font(.subheadline.weight(.semibold))
                                        Text([c.antes, c.ahora].compactMap { $0 }.joined(separator: " → "))
                                        if let nota = c.nota { Text(nota).foregroundStyle(Tema.tinta2) }
                                    }
                                }
                            }
                        }
                        if let extras = detalle?.extras, !extras.isEmpty {
                            Bloque(titulo: ajustes.tr("Extras", "Extras"), icono: "sparkles.tv") {
                                ForEach(extras, id: \.self) { x in
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(x.t).font(.subheadline.weight(.semibold))
                                        if let d = x.d { Text(d) }
                                        if let donde = x.donde { Text(donde).font(.caption).foregroundStyle(Tema.tinta2) }
                                    }
                                }
                            }
                        }
                        EnLaSaga(titulo: titulo).ancla("saga")
                        enlaces(catalogo)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 18)
                    .padding(.bottom, 28)
                }
            }
            .conAnclaDepuracion()
            .onChange(of: titulo.id) { revela = false; historiaEntera = false }
            .background(Tema.fondo)
            .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top > 300 } action: { _, pasado in
                withAnimation(.easeOut(duration: 0.2)) { tituloEnBarra = pasado }
            }
            .ignoresSafeArea(edges: .top)
            .navigationTitle(tituloEnBarra ? catalogo.nombre(titulo, en: ajustes.idioma) : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // la de arriba del todo se cierra con ✕ (o bajándola); las apiladas, con «volver»
                if !apilada {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { nav.ficha = nil } label: { Image(systemName: "xmark").foregroundStyle(Tema.tinta) }
                            .accessibilityLabel(ajustes.tr("Cerrar", "Close"))
                    }
                }
            }
        }
    }

    /// El fotograma a todo lo ancho que se funde con el fondo, con el póster,
    /// la saga y su lugar en ella, el título y lo esencial debajo
    private func heroe(_ catalogo: Catalogo, color: Color) -> some View {
        let saga = catalogo.saga(de: titulo.id)
        let nombreSaga = catalogo.texto(catalogo.sagas.first { $0.saga == saga }?.titulo, en: ajustes.idioma)
        let pos = catalogo.posicionEnSaga(titulo.id)
        return ZStack(alignment: .bottomLeading) {
            Fotograma(remota: catalogo.urlFotograma(titulo.id, ancho: 1280), local: catalogo.urlPoster(titulo.id), color: color)
                .frame(height: 400)
                .overlay {
                    LinearGradient(stops: [.init(color: Tema.fondo.opacity(0), location: 0.3),
                                           .init(color: Tema.fondo.opacity(0.75), location: 0.68),
                                           .init(color: Tema.fondo, location: 1)],
                                   startPoint: .top, endPoint: .bottom)
                }
            HStack(alignment: .bottom, spacing: 16) {
                Poster(url: catalogo.urlPoster(titulo.id, idioma: ajustes.idioma), ancho: 104, radio: Tema.radioL)
                    .overlay { if progreso.visto(titulo.id) { SelloVista().transition(.scale.combined(with: .opacity)) } }
                    .shadow(color: .black.opacity(0.4), radius: 16, y: 10)
                VStack(alignment: .leading, spacing: 8) {
                    if let nombreSaga {
                        Rotulo(texto: nombreSaga + (pos.map { " · \($0.posicion)/\($0.total)" } ?? ""), color: Tema.tinta2, punto: color)
                    }
                    Text(catalogo.nombre(titulo, en: ajustes.idioma))
                        .font(.title.weight(.heavy))
                        .foregroundStyle(Tema.tinta)
                        .lineLimit(4)
                        .minimumScaleFactor(0.75)
                        .accessibilityAddTraits(.isHeader)
                    if let plat = catalogo.plataforma(titulo, pais: ajustes.pais) {
                        Label(plat, systemImage: "play.tv")
                            .font(.footnote.weight(.semibold))
                            .lineLimit(1)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .glassEffect(.regular.tint(Tema.verde.opacity(0.18)), in: .capsule)
                            .foregroundStyle(Tema.verde)
                    }
                }
            }
            .padding(.horizontal, 20)
        }
    }

    /// Marcar, tráiler y listas en una fila: el principal ancho, los otros redondos
    private func acciones(_ catalogo: Catalogo, color: Color) -> some View {
        let visto = progreso.visto(titulo.id)
        let comic = catalogo.saga(de: titulo.id) == "comics"
        // vidrio líquido: los tres se funden entre sí al cambiar
        return GlassEffectContainer(spacing: 12) {
            HStack(spacing: 12) {
                Button {
                    withAnimation(.snappy) { progreso.alternar(titulo.id) }
                } label: {
                    Label(comic ? (visto ? ajustes.tr("Leído", "Read") : ajustes.tr("Marcar como leído", "Mark as read"))
                                : (visto ? ajustes.tr("Vista", "Seen") : ajustes.tr("Marcar como vista", "Mark as seen")),
                          systemImage: visto ? "checkmark" : "plus")
                        .contentTransition(.symbolEffect(.replace))
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(.glassProminent)
                .buttonBorderShape(.capsule)
                .tint(visto ? Tema.verde : color)
                .sensoryFeedback(.success, trigger: visto) { _, nuevo in nuevo }
                .accessibilityHint(visto ? ajustes.tr("Toca para dejarla pendiente", "Tap to mark as pending") : "")
                if let ref = catalogo.tmdb(titulo.id), let clave = catalogo.claveTMDB {
                    Button {
                        Task { await abreTrailer(ref: ref, clave: clave) }
                    } label: {
                        Group {
                            if buscandoTrailer { ProgressView() } else { Image(systemName: "play.fill") }
                        }
                        .modifier(Redondo())
                    }
                    .buttonStyle(.plain)
                    .disabled(buscandoTrailer)
                    .accessibilityLabel(ajustes.tr("Tráiler", "Trailer"))
                    .alert(ajustes.tr("No encontré el tráiler", "No trailer found"), isPresented: $sinTrailer) {
                        Button("OK", role: .cancel) {}
                    }
                }
                MenuListas(id: titulo.id)
            }
        }
    }

    /// La tira de datos, como la de la App Store: nota, estreno, duración,
    /// cuándo pasa y las escenas en los créditos (sin spoilers, estas no)
    private func datos(_ catalogo: Catalogo, oculto: Bool) -> some View {
        var celdas: [(rotulo: String, valor: String, pie: String?)] = []
        if let s = titulo.s { celdas.append(("IMDb", String(format: "%.1f", s), "★★★★★".prefix(Int((s / 2).rounded())).description)) }
        if let r = titulo.r { celdas.append((ajustes.tr("Estreno", "Release"), String(r), nil)) }
        if titulo.esSerie {
            let temporadas = catalogo.temporadas(de: titulo.id)
            let eps = temporadas.reduce(0) { $0 + $1.episodios.count }
            if eps > 0 {
                celdas.append((ajustes.tr("Episodios", "Episodes"), "\(eps)",
                               ajustes.tr("\(temporadas.count) temporada\(temporadas.count == 1 ? "" : "s")",
                                          "\(temporadas.count) season\(temporadas.count == 1 ? "" : "s")")))
            }
        } else if let d = titulo.d {
            celdas.append((ajustes.tr("Duración", "Runtime"), Formato.duracion(d), nil))
        }
        if let h = catalogo.texto(titulo.h, en: ajustes.idioma), h != "—" { celdas.append((ajustes.tr("Ocurre en", "Set in"), h, nil)) }
        if !oculto, let pc = catalogo.texto(titulo.pc, en: ajustes.idioma) {
            celdas.append((ajustes.tr("Post-créditos", "Post-credits"),
                           pc == "0" ? ajustes.tr("Ninguna", "None") : pc.split(separator: " ").first.map(String.init) ?? pc,
                           pc == "0" ? nil : pc.split(separator: " ").dropFirst().joined(separator: " ")
                               .trimmingCharacters(in: CharacterSet(charactersIn: "()"))))
        }
        if let a = titulo.a { celdas.append((ajustes.tr("Autores", "Creators"), a, nil)) }
        return ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 0) {
                ForEach(Array(celdas.enumerated()), id: \.offset) { i, c in
                    if i > 0 { Rectangle().fill(Tema.linea).frame(width: 1, height: 44).padding(.top, 6) }
                    VStack(spacing: 4) {
                        Text(c.rotulo.uppercased())
                            .font(.caption2.weight(.bold)).tracking(0.8)
                            .foregroundStyle(Tema.tinta3)
                        Text(c.valor)
                            .font(.title3.weight(.bold).monospacedDigit())
                            .foregroundStyle(i == 0 && titulo.s != nil ? Tema.oro : Tema.tinta)
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                            .minimumScaleFactor(0.7)
                        if let pie = c.pie, !pie.isEmpty {
                            Text(pie).font(.caption).foregroundStyle(Tema.tinta2).lineLimit(2).multilineTextAlignment(.center)
                        }
                    }
                    .frame(minWidth: 92, maxWidth: 150)
                    .padding(.horizontal, 6)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.vertical, 14)
            .padding(.horizontal, 8)
        }
        .scrollIndicators(.hidden)
        .superficie(radio: Tema.radioL)
    }

    /// El resumen y, debajo, la historia larga plegada en cuatro líneas
    @ViewBuilder
    private func sinopsis(_ catalogo: Catalogo, larga: String?) -> some View {
        let res = catalogo.texto(titulo.res, en: ajustes.idioma)
        if res != nil || larga != nil {
            VStack(alignment: .leading, spacing: 12) {
                if let res {
                    Text(res).font(.title3.weight(.medium)).foregroundStyle(Tema.tinta)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let larga {
                    Text(larga)
                        .font(.body).foregroundStyle(Tema.tinta2)
                        .lineLimit(historiaEntera ? nil : 4)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(historiaEntera ? ajustes.tr("Leer menos", "Read less") : ajustes.tr("Leer la historia", "Read the story")) {
                        withAnimation(.snappy) { historiaEntera.toggle() }
                    }
                    .font(.subheadline.weight(.semibold))
                    .tint(Tema.tinta)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// IMDb y Letterboxd al final, como enlaces discretos
    private func enlaces(_ catalogo: Catalogo) -> some View {
        // sin el sufijo de temporadas («Cloak & Dagger (S1–S2)») y con & codificado
        let enIngles = catalogo.nombre(titulo, en: .en)
            .replacingOccurrences(of: #"\s*\([^)]*\)$"#, with: "", options: .regularExpression)
        var permitidos = CharacterSet.urlQueryAllowed
        permitidos.remove(charactersIn: "&=+?/#")
        let q = enIngles.addingPercentEncoding(withAllowedCharacters: permitidos) ?? enIngles
        return HStack(spacing: 10) {
            if let imdb = URL(string: "https://www.imdb.com/find/?q=\(q)") {
                Link(destination: imdb) { Label("IMDb", systemImage: "arrow.up.right") }
            }
            if let lb = URL(string: "https://letterboxd.com/search/films/\(q)/") {
                Link(destination: lb) { Label("Letterboxd", systemImage: "arrow.up.right") }
            }
        }
        .font(.subheadline.weight(.semibold))
        .buttonStyle(.glass)
        .buttonBorderShape(.capsule)
        .tint(Tema.tinta)
        .labelStyle(.titleAndIcon)
        .frame(maxWidth: .infinity)
    }

    /// Lo que la web dice en modo sin spoilers, con su «Mostrar de todos modos»
    private var avisoSpoilers: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(ajustes.tr("Sinopsis, escenas post-créditos y títulos de episodio ocultos hasta que lo marques como visto.",
                             "Synopsis, post-credit scenes and episode titles hidden until you mark it as seen."),
                  systemImage: "eye.slash")
                .font(.subheadline).foregroundStyle(Tema.tinta2)
            Button(ajustes.tr("Mostrar de todos modos", "Show anyway")) {
                withAnimation(.snappy) { revela = true }
            }
            .font(.subheadline.weight(.semibold))
            .buttonStyle(.glass)
            .buttonBorderShape(.capsule)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .superficie(radio: Tema.radioL)
    }

    /// El recuadro dorado de la web; lo que pasa, tapado hasta tocarlo
    @ViewBuilder
    private func postCreditos(_ catalogo: Catalogo, detalle: Detalle?) -> some View {
        let escenas = detalle?.pcs ?? []
        if let pc = titulo.pc, pc != "0" || !escenas.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                let nota = titulo.pcn.map { " · " + (catalogo.texto($0, en: ajustes.idioma) ?? $0) } ?? ""
                Text("\(ajustes.tr("Escenas en los créditos:", "Credit scenes:")) \(Text(pc).bold())\(nota)")
                if !escenas.isEmpty {
                    if verPostCreditos {
                        ForEach(escenas, id: \.self) { e in
                            VStack(alignment: .leading, spacing: 2) {
                                Text([e.cuando, e.t].compactMap { $0 }.joined(separator: " · ")).bold()
                                if let d = e.d { Text(d).foregroundStyle(Tema.tinta) }
                                if let c = e.conecta { Text(c).foregroundStyle(Tema.tinta2) }
                            }
                        }
                    } else {
                        Button(ajustes.tr("Ver qué pasa (spoiler)", "Show what happens (spoiler)")) {
                            withAnimation(.snappy) { verPostCreditos = true }
                        }
                        .bold()
                    }
                }
            }
            .font(.subheadline)
            .foregroundStyle(Tema.oro)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Tema.oro.opacity(0.1), in: .rect(cornerRadius: Tema.radioL))
            .overlay(RoundedRectangle(cornerRadius: Tema.radioL).strokeBorder(Tema.oro.opacity(0.6), lineWidth: 1.5))
        }
    }

    @ViewBuilder
    private func reparto(_ catalogo: Catalogo) -> some View {
        // la dirección separada («Anthony y Joe Russo» son dos) y sin «(voz)»
        let personas = catalogo.personas(de: titulo)
        if !personas.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Rotulo(texto: ajustes.tr("Dirección y reparto", "Director and cast"))
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: 16) {
                        ForEach(personas, id: \.nombre) { p in
                            NavigationLink(value: RutaPersona(nombre: p.nombre, esDireccion: p.esDireccion, desde: titulo.id,
                                                              origen: "reparto:\(titulo.id):\(p.nombre)")) {
                                VStack(spacing: 6) {
                                    ImagenLocal(url: catalogo.urlFoto(persona: p.nombre)) {
                                        Tema.panel2.overlay(Image(systemName: "person.fill").foregroundStyle(Tema.tinta3))
                                    }
                                    .frame(width: 76, height: 76)
                                    .clipShape(.circle)
                                    .origenZoom("reparto:\(titulo.id):\(p.nombre)", radio: 38)
                                    .overlay(Circle().strokeBorder(Tema.linea, lineWidth: 2))
                                    Text(p.nombre).font(.caption.weight(.semibold)).multilineTextAlignment(.center)
                                        .foregroundStyle(Tema.tinta)
                                    if p.esDireccion {
                                        Text(ajustes.tr("Dirección", "Director")).font(.caption2).foregroundStyle(Tema.tinta2)
                                    }
                                }
                                .frame(width: 88)
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint(ajustes.tr("Abre su página", "Opens their page"))
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    private func abreTrailer(ref: RefTMDB, clave: String) async {
        buscandoTrailer = true
        defer { buscandoTrailer = false }
        let idioma = ajustes.idioma == .en ? "en-US" : ajustes.idioma == .latam ? "es-MX" : "es-ES"
        if let url = await Trailer.busca(ref: ref, clave: clave, idioma: idioma) {
            abrirURL(url)
        } else {
            sinTrailer = true
        }
    }
}

/// Bloque de la ficha con título e icono, sobre una superficie Norte
struct Bloque<Contenido: View>: View {
    let titulo: String
    let icono: String
    @ViewBuilder let contenido: Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(titulo, systemImage: icono).font(.headline).foregroundStyle(Tema.tinta)
            contenido.font(.subheadline).foregroundStyle(Tema.tinta)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .superficie(radio: Tema.radioL)
    }
}

private struct Episodios: View {
    let titulo: Titulo
    let color: Color
    /// Sin spoilers: los no vistos dicen «Episodio N»
    var oculto = false
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        let (v, t) = progreso.vistosDe(serie: titulo.id)
        Bloque(titulo: ajustes.tr("Episodios · \(v)/\(t)", "Episodes · \(v)/\(t)"), icono: "list.number") {
            Barra(fraccion: t == 0 ? 0 : Double(v) / Double(t), color: color)
            ForEach(catalogo?.temporadas(de: titulo.id) ?? [], id: \.numero) { temporada in
                DisclosureGroup {
                    ForEach(temporada.episodios, id: \.self) { e in
                        let hecho = progreso.visto(e, de: titulo.id)
                        HStack {
                            Text(oculto && !hecho ? ajustes.tr("Episodio \(e.n)", "Episode \(e.n)")
                                 : "\(e.n). \(catalogo?.nombre(e, de: titulo.id, en: ajustes.idioma) ?? e.t)")
                                .foregroundStyle(hecho ? Tema.tinta2 : Tema.tinta)
                            Spacer()
                            Casilla(marcada: progreso.visto(e, de: titulo.id), color: color) {
                                withAnimation(.snappy) { progreso.alternar(e, de: titulo.id) }
                            }
                        }
                    }
                } label: {
                    let vistos = temporada.episodios.filter { progreso.visto($0, de: titulo.id) }.count
                    Text(ajustes.tr("Temporada \(temporada.numero)", "Season \(temporada.numero)") + "  \(vistos)/\(temporada.episodios.count)")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                }
                .tint(Tema.tinta)
            }
        }
    }
}

/// Busca el tráiler en TMDB (la misma clave pública de lectura que la web)
enum Trailer {
    struct Respuesta: Decodable {
        struct Video: Decodable { let key: String; let site: String; let type: String; let official: Bool? }
        let results: [Video]
    }

    static func busca(ref: RefTMDB, clave: String, idioma: String) async -> URL? {
        // Primero un tráiler en su idioma, luego en inglés; un vídeo cualquiera
        // (avance, clip) solo si ninguno de los dos tiene tráiler.
        var cualquiera: Respuesta.Video?
        for lengua in idioma == "en-US" ? ["en-US"] : [idioma, "en-US"] {
            var c = URLComponents(string: "https://api.themoviedb.org/3/\(ref.tipo)/\(ref.numero)/videos")!
            c.queryItems = [URLQueryItem(name: "api_key", value: clave), URLQueryItem(name: "language", value: lengua)]
            guard let url = c.url,
                  let (datos, _) = try? await URLSession.shared.data(from: url),
                  let r = try? JSONDecoder().decode(Respuesta.self, from: datos) else { continue }
            let youtube = r.results.filter { $0.site == "YouTube" }
            if let v = youtube.first(where: { $0.type == "Trailer" && $0.official == true })
                ?? youtube.first(where: { $0.type == "Trailer" }) {
                return URL(string: "https://www.youtube.com/watch?v=\(v.key)")
            }
            cualquiera = cualquiera ?? youtube.first
        }
        return cualquiera.flatMap { URL(string: "https://www.youtube.com/watch?v=\($0.key)") }
    }
}

/// Tus estrellas y tu reseña (solo tuyas), como «Tu valoración» de la web.
/// Tocar la estrella que ya tenías la quita.
private struct TuValoracion: View {
    let id: String
    let vista: Bool
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @FocusState private var escribiendo: Bool
    /// Lo que vas escribiendo: se guarda al parar de escribir, no con cada tecla
    /// (cada guardado escribe progreso.json y recalcula los logros)
    @State private var borrador: String?

    var body: some View {
        let nota = progreso.nota(id)
        let p = nota.p ?? 0
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(p > 0 || !vista ? ajustes.tr("Tu valoración", "Your rating") : ajustes.tr("¿Qué te pareció?", "What did you think?"))
                    .font(.headline).foregroundStyle(Tema.tinta)
                Spacer()
                HStack(spacing: 2) {
                    ForEach(1...5, id: \.self) { n in
                        Button {
                            withAnimation(.snappy) { progreso.ponEstrellas(n, a: id) }
                        } label: {
                            Image(systemName: p >= n ? "star.fill" : "star")
                                .font(.title3)
                                .foregroundStyle(p >= n ? Tema.oro : Tema.tinta3)
                                .symbolEffect(.bounce, value: p == n)
                                .frame(width: 40, height: 44)
                                .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(ajustes.tr("\(n) estrella\(n == 1 ? "" : "s")", "\(n) star\(n == 1 ? "" : "s")"))
                        .accessibilityAddTraits(p == n ? .isSelected : [])
                    }
                }
                .sensoryFeedback(.selection, trigger: p)
            }
            TextField(ajustes.tr("Tus notas (solo tuyas)…", "Your notes (yours only)…"),
                      text: Binding(get: { borrador ?? progreso.nota(id).txt ?? "" }, set: { borrador = $0 }),
                      axis: .vertical)
                .lineLimit(2...6)
                .focused($escribiendo)
                .padding(12)
                .background(Tema.panel2, in: .rect(cornerRadius: Tema.radioM))
                .accessibilityLabel(ajustes.tr("Tus notas", "Your notes"))
            if escribiendo {
                HStack {
                    Text("\((borrador ?? nota.txt ?? "").count)/\(Nota.largoMaximo)")
                        .font(.caption.monospacedDigit()).foregroundStyle(Tema.tinta2)
                    Spacer()
                    Button(ajustes.tr("Listo", "Done")) { escribiendo = false }
                        .font(.subheadline.weight(.semibold))
                }
            }
        }
        .padding(16)
        .superficie(radio: Tema.radioL)
        .task(id: borrador) {
            guard borrador != nil else { return }
            // otra tecla cancela la espera: entonces no se guarda todavía
            guard (try? await Task.sleep(for: .seconds(0.8))) != nil else { return }
            guarda()
        }
        .onChange(of: escribiendo) { _, ahora in if !ahora { guarda() } }
        .onDisappear(perform: guarda)
    }

    private func guarda() {
        guard let b = borrador else { return }
        borrador = nil
        if b != (progreso.nota(id).txt ?? "") { progreso.ponTexto(b, a: id) }
    }
}

/// «Leer aquí» en la ficha de un cómic, como TuArchivo de la web: eliges tu
/// archivo, se copia dentro de la app y se abre a pantalla completa
struct LeerAqui: View {
    let titulo: Titulo
    @Environment(Biblioteca.self) private var biblioteca
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @State private var eligiendo = false
    @State private var ocupado = false
    @State private var error: String?
    @State private var confirmaQuitar = false
    @State private var leyendo = false

    /// .cbz y .cbr no son tipos del sistema: se declaran en project.yml
    static let tipos: [UTType] = [.pdf, .zip, .image] + ["cbz", "cbr"].compactMap { UTType(filenameExtension: $0) }

    var body: some View {
        let archivo = biblioteca.archivos[titulo.id]
        Bloque(titulo: ajustes.tr("Leer aquí", "Read here"), icono: "book.pages") {
            VStack(alignment: .leading, spacing: 10) {
                if let archivo {
                    Button { leyendo = true } label: {
                        Label(seguir ?? ajustes.tr("Abrir", "Open"), systemImage: "book")
                            .font(.body.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent).buttonBorderShape(.capsule).tint(Tema.rojo)
                    HStack(spacing: 10) {
                        Button(ajustes.tr("Cambiar archivo", "Change file")) { eligiendo = true }
                        Button(ajustes.tr("Quitar", "Remove"), role: .destructive) { confirmaQuitar = true }
                    }
                    .buttonStyle(.bordered).buttonBorderShape(.capsule)
                    Text("\(nombre(archivo)) · \(archivo.tam.formatted(.byteCount(style: .file))) · \(ajustes.tr("guardado en este iPhone", "stored on this iPhone"))")
                        .font(.caption).foregroundStyle(Tema.tinta2)
                } else {
                    Button { eligiendo = true } label: {
                        Label(ajustes.tr("Elegir mi archivo (CBZ, PDF o imágenes)", "Pick my file (CBZ, PDF or images)"), systemImage: "folder")
                            .font(.body.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered).buttonBorderShape(.capsule)
                    Text(ajustes.tr("Se lee dentro de la app y el archivo se queda en este iPhone: no se sube a ningún sitio. Vale un CBZ, un PDF o las páginas como imágenes (elige varias a la vez). Los CBR que son RAR aún no se abren: pásalos a CBZ.",
                                    "It opens inside the app and the file stays on this iPhone: nothing gets uploaded. A CBZ, a PDF or the pages as images (pick several at once) work. CBRs that are RAR archives can't be opened yet: convert them to CBZ."))
                        .font(.caption).foregroundStyle(Tema.tinta2)
                }
                if ocupado { ProgressView(ajustes.tr("Guardando…", "Saving…")).font(.caption) }
                if let error { Text(error).font(.caption).foregroundStyle(Tema.rojo) }
            }
            .disabled(ocupado)
        }
        .fileImporter(isPresented: $eligiendo, allowedContentTypes: Self.tipos, allowsMultipleSelection: true) { r in
            Task { await guarda(r) }
        }
        .confirmationDialog(ajustes.tr("¿Quitar el archivo de este iPhone?", "Remove the file from this iPhone?"),
                            isPresented: $confirmaQuitar, titleVisibility: .visible) {
            Button(ajustes.tr("Quitar el archivo", "Remove the file"), role: .destructive) {
                biblioteca.quita(titulo.id)
                progreso.olvidaLectura(titulo.id)
            }
        } message: {
            Text(ajustes.tr("Lo marcado y tus notas se quedan.", "Your marks and notes stay."))
        }
        .fullScreenCover(isPresented: $leyendo) { LectorView(titulo: titulo) }
        #if DEBUG
        // capturas: `-abrir c-… -leer YES` abre el lector
        .task { if UserDefaults.standard.bool(forKey: "leer") && archivo != nil { leyendo = true } }
        #endif
    }

    /// «Seguir leyendo · pág. 4 de 24»
    private var seguir: String? {
        guard let l = progreso.lecturas[titulo.id], l.t > 1, !progreso.visto(titulo.id) else { return nil }
        return ajustes.tr("Seguir leyendo · pág. \(l.p + 1) de \(l.t)", "Keep reading · p. \(l.p + 1) of \(l.t)")
    }

    private func nombre(_ a: ArchivoComic) -> String {
        a.tipo == .imagenes && Int(a.nombre) != nil ? ajustes.tr("\(a.nombre) imágenes", "\(a.nombre) images") : a.nombre
    }

    private func guarda(_ r: Result<[URL], Error>) async {
        error = nil
        guard case let .success(urls) = r, !urls.isEmpty else {
            if case let .failure(e) = r { error = Lectura.texto(de: e, ajustes) }
            return
        }
        ocupado = true
        defer { ocupado = false }
        do {
            try await biblioteca.guarda(urls, para: titulo.id)
            progreso.olvidaLectura(titulo.id)
            leyendo = true
        } catch {
            self.error = Lectura.texto(de: error, ajustes)
        }
    }
}

/// «Tus listas»: un chip por lista (lleno si el título está en ella) y «Nueva
/// lista», que la crea con este título dentro
/// Botón redondo de vidrio de 52 pt junto al principal (tráiler, listas);
/// activo, teñido de oro
private struct Redondo: ViewModifier {
    var activo = false
    func body(content: Content) -> some View {
        content
            .font(.title3.weight(.semibold))
            .foregroundStyle(activo ? Color.white : Tema.tinta)
            .frame(width: 52, height: 52)
            .contentShape(.circle)
            .glassEffect(activo ? .regular.tint(Tema.oro).interactive() : .regular.interactive(), in: .circle)
    }
}

/// Tus listas en un menú: cada una con su marca y, al final, «Nueva lista».
/// El botón se pinta de oro si el título está en alguna.
private struct MenuListas: View {
    let id: String
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @State private var creando = false

    var body: some View {
        let dentro = progreso.listas.filter { $0.items.contains(id) }.count
        Menu {
            Section(ajustes.tr("Tus listas", "Your lists")) {
                ForEach(progreso.listas) { l in
                    Toggle(l.nombre, isOn: Binding(get: { l.items.contains(id) },
                                                   set: { _ in withAnimation(.snappy) { progreso.alternar(id, enLista: l.id) } }))
                }
            }
            // marcar varias seguidas sin que se cierre; «Nueva lista» sí lo cierra (si no, su alerta no sale)
            .menuActionDismissBehavior(.disabled)
            Button { creando = true } label: { Label(ajustes.tr("Nueva lista", "New list"), systemImage: "plus") }
        } label: {
            Image(systemName: dentro > 0 ? "bookmark.fill" : "bookmark")
                .contentTransition(.symbolEffect(.replace))
                .modifier(Redondo(activo: dentro > 0))
        }
        .sensoryFeedback(.selection, trigger: dentro)
        .accessibilityLabel(ajustes.tr("Tus listas", "Your lists"))
        .accessibilityValue(dentro > 0 ? ajustes.tr("En \(dentro) lista\(dentro == 1 ? "" : "s")", "On \(dentro) list\(dentro == 1 ? "" : "s")") : "")
        .modifier(PideNombre(titulo: ajustes.tr("Nueva lista", "New list"), activo: $creando) { nombre in
            if let l = progreso.creaLista(nombre) { progreso.alternar(id, enLista: l) }
        })
    }
}

/// El de antes y el de después en su saga: tocarlos abre su ficha encima
private struct EnLaSaga: View {
    let titulo: Titulo
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        if let catalogo {
            let v = catalogo.vecinosEnSaga(titulo.id)
            if v.anterior != nil || v.siguiente != nil {
                VStack(alignment: .leading, spacing: 12) {
                    Rotulo(texto: ajustes.tr("En la saga", "In the saga"))
                    HStack(alignment: .top, spacing: 12) {
                        tarjeta(v.anterior, rotulo: ajustes.tr("Antes", "Before"), catalogo: catalogo)
                        tarjeta(v.siguiente, rotulo: ajustes.tr("Después", "After"), catalogo: catalogo)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func tarjeta(_ t: Titulo?, rotulo: String, catalogo: Catalogo) -> some View {
        if let t {
            NavigationLink(value: RutaTitulo(titulo: t, origen: "saga:\(titulo.id):\(t.id)")) {
                VStack(alignment: .leading, spacing: 8) {
                    Poster(url: catalogo.urlPoster(t.id, idioma: ajustes.idioma), ancho: 64, radio: Tema.radioM)
                        .origenZoom("saga:\(titulo.id):\(t.id)")
                        .overlay(alignment: .bottomTrailing) {
                            if progreso.visto(t.id) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.title3).foregroundStyle(.white, Tema.verde)
                                    .padding(4)
                            }
                        }
                    Text(rotulo.uppercased()).font(.caption2.weight(.bold)).tracking(0.8).foregroundStyle(Tema.tinta3)
                    Text(catalogo.nombre(t, en: ajustes.idioma))
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Tema.tinta)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    Text(Formato.meta(t, catalogo: catalogo)).font(.caption).foregroundStyle(Tema.tinta2).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .superficie(radio: Tema.radioL)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityHint(ajustes.tr("Abre su ficha", "Opens its page"))
        } else {
            Color.clear.frame(maxWidth: .infinity, maxHeight: 1)
        }
    }
}
