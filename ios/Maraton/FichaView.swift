import SwiftUI
import UniformTypeIdentifiers
import MaratonKit

/// La ficha de un título: datos, dónde verlo, historia, post-créditos (tapados
/// hasta tocarlos), episodios, cambios de actor, extras y reparto
struct FichaView: View {
    let titulo: Titulo
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(\.openURL) private var abrirURL
    @State private var verPostCreditos = false
    @State private var buscandoTrailer = false
    @State private var sinTrailer = false

    var body: some View {
        if let catalogo {
            let color = Tema.color(saga: catalogo.saga(de: titulo.id))
            let detalle = catalogo.detalle(titulo.id, en: ajustes.idioma)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Fotograma(remota: catalogo.urlFotograma(titulo.id), local: catalogo.urlPoster(titulo.id), color: color)
                        .frame(height: 210)
                        .overlay(LinearGradient(colors: [.clear, Tema.fondo], startPoint: .center, endPoint: .bottom))
                    VStack(alignment: .leading, spacing: 18) {
                        cabecera(catalogo, color: color)
                            .padding(.top, -96)
                        botonVisto(color: color)
                        if catalogo.saga(de: titulo.id) == "comics" { LeerAqui(titulo: titulo) }
                        TuValoracion(id: titulo.id, vista: progreso.visto(titulo.id))
                        EnTusListas(id: titulo.id)
                        if let res = catalogo.texto(titulo.res, en: ajustes.idioma) {
                            Text(res).font(.body).foregroundStyle(Tema.tinta)
                        }
                        postCreditos(catalogo, detalle: detalle)
                        pildoras(catalogo)
                        if let n = catalogo.texto(titulo.n, en: ajustes.idioma) {
                            Bloque(titulo: ajustes.tr("Antes de verla", "Before watching"), icono: "lightbulb") { Text(n) }
                        }
                        if let larga = detalle?.larga {
                            Bloque(titulo: ajustes.tr("La historia", "The story"), icono: "book") { Text(larga) }
                        }
                        if titulo.esSerie && !catalogo.episodios(de: titulo.id).isEmpty {
                            Episodios(titulo: titulo, color: color)
                        }
                        reparto(catalogo)
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
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 28)
                }
            }
            .background(Tema.fondo)
            .ignoresSafeArea(edges: .top)
        }
    }

    private func cabecera(_ catalogo: Catalogo, color: Color) -> some View {
        HStack(alignment: .bottom, spacing: 16) {
            Poster(url: catalogo.urlPoster(titulo.id, idioma: ajustes.idioma), ancho: 118, radio: Tema.radioL)
                .overlay { if progreso.visto(titulo.id) { SelloVista().transition(.scale.combined(with: .opacity)) } }
                .shadow(color: .black.opacity(0.35), radius: 14, y: 8)
            VStack(alignment: .leading, spacing: 6) {
                if let plat = catalogo.plataforma(titulo, pais: ajustes.pais) {
                    Text(plat)
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Tema.verde.opacity(0.16), in: .rect(cornerRadius: Tema.radioS + 2))
                        .foregroundStyle(Tema.verde)
                }
                Text(catalogo.nombre(titulo, en: ajustes.idioma))
                    .font(.title2.weight(.bold)).foregroundStyle(Tema.tinta)
                HStack(spacing: 4) {
                    if let s = titulo.s {
                        Text("★ \(String(format: "%.1f", s)) \(ajustes.tr("en IMDb", "on IMDb"))").foregroundStyle(Tema.oro).bold()
                    }
                    if let r = titulo.r {
                        Text("· \(String(r))").foregroundStyle(Tema.azul).bold()
                        Text(ajustes.tr("estreno", "release")).foregroundStyle(Tema.tinta2)
                    }
                }
                .font(.subheadline)
                Text([titulo.h.flatMap { $0 == "—" ? nil : $0 }, titulo.esSerie ? Formato.meta(titulo, catalogo: catalogo) : titulo.d.map(Formato.duracion), titulo.a]
                        .compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(Tema.tinta2)
            }
        }
    }

    private func botonVisto(color: Color) -> some View {
        let visto = progreso.visto(titulo.id)
        let comic = catalogo?.saga(de: titulo.id) == "comics"
        return Button {
            withAnimation(.snappy) { progreso.alternar(titulo.id) }
        } label: {
            Text(comic ? (visto ? ajustes.tr("✓ Leído — marcar pendiente", "✓ Read — mark as pending")
                                : ajustes.tr("Marcar como leído", "Mark as read"))
                       : visto ? ajustes.tr("✓ Vista — marcar pendiente", "✓ Seen — mark as pending")
                               : ajustes.tr("Marcar como vista", "Mark as seen"))
                .font(.body.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 50)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .tint(visto ? Tema.verde : color)
        .shadow(color: (visto ? Tema.verde : color).opacity(0.4), radius: 12, y: 5)
        .sensoryFeedback(.success, trigger: visto) { _, nuevo in nuevo }
    }

    /// Tráiler, IMDb y Letterboxd en píldoras, como en la web
    private func pildoras(_ catalogo: Catalogo) -> some View {
        // sin el sufijo de temporadas («Cloak & Dagger (S1–S2)») y con & codificado
        let enIngles = catalogo.nombre(titulo, en: .en)
            .replacingOccurrences(of: #"\s*\([^)]*\)$"#, with: "", options: .regularExpression)
        var permitidos = CharacterSet.urlQueryAllowed
        permitidos.remove(charactersIn: "&=+?/#")
        let q = enIngles.addingPercentEncoding(withAllowedCharacters: permitidos) ?? enIngles
        return HStack(spacing: 10) {
            if let ref = catalogo.tmdb(titulo.id), let clave = catalogo.claveTMDB {
                Button {
                    Task { await abreTrailer(ref: ref, clave: clave) }
                } label: {
                    Group {
                        if buscandoTrailer { ProgressView() } else { Label(ajustes.tr("Tráiler", "Trailer"), systemImage: "play.fill") }
                    }
                }
                .disabled(buscandoTrailer)
                .alert(ajustes.tr("No encontré el tráiler", "No trailer found"), isPresented: $sinTrailer) {
                    Button("OK", role: .cancel) {}
                }
            }
            if let imdb = URL(string: "https://www.imdb.com/find/?q=\(q)") {
                Link(destination: imdb) { Label("IMDb", systemImage: "arrow.up.right.square") }
            }
            if let lb = URL(string: "https://letterboxd.com/search/films/\(q)/") {
                Link(destination: lb) { Label("Letterboxd", systemImage: "arrow.up.right.square") }
            }
        }
        .font(.subheadline.weight(.semibold))
        .buttonStyle(.bordered)
        .buttonBorderShape(.capsule)
        .tint(Tema.tinta)
        .labelStyle(.titleAndIcon)
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
        let personas = (titulo.dir.map { [($0, ajustes.tr("Dirección", "Director"))] } ?? [])
            + (titulo.cast ?? []).map { ($0, "") }
        if !personas.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Rotulo(texto: ajustes.tr("Dirección y reparto", "Director and cast"))
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: 16) {
                        ForEach(personas, id: \.0) { p, papel in
                            VStack(spacing: 6) {
                                ImagenLocal(url: catalogo.urlFoto(persona: p)) {
                                    Tema.panel2.overlay(Image(systemName: "person.fill").foregroundStyle(Tema.tinta3))
                                }
                                .frame(width: 76, height: 76)
                                .clipShape(.circle)
                                .overlay(Circle().strokeBorder(Tema.linea, lineWidth: 2))
                                Text(p).font(.caption.weight(.semibold)).multilineTextAlignment(.center)
                                if !papel.isEmpty { Text(papel).font(.caption2).foregroundStyle(Tema.tinta2) }
                            }
                            .frame(width: 88)
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
                        HStack {
                            Text("\(e.n). \(catalogo?.nombre(e, de: titulo.id, en: ajustes.idioma) ?? e.t)")
                                .foregroundStyle(progreso.visto(e, de: titulo.id) ? Tema.tinta2 : Tema.tinta)
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
private struct EnTusListas: View {
    let id: String
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @State private var creando = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(ajustes.tr("Tus listas", "Your lists")).font(.headline).foregroundStyle(Tema.tinta)
            Fluir(espacio: 8) {
                ForEach(progreso.listas) { l in
                    let dentro = l.items.contains(id)
                    Button {
                        withAnimation(.snappy) { progreso.alternar(id, enLista: l.id) }
                    } label: {
                        Label(l.nombre, systemImage: dentro ? "checkmark" : "plus")
                            .lineLimit(1)
                            .contentTransition(.symbolEffect(.replace))
                    }
                    .buttonStyle(ChipLista(dentro: dentro))
                    .accessibilityValue(dentro ? ajustes.tr("En la lista", "On the list") : "")
                    .sensoryFeedback(.selection, trigger: dentro)
                }
                Button { creando = true } label: {
                    Label(ajustes.tr("Nueva lista", "New list"), systemImage: "plus")
                }
                .buttonStyle(ChipLista(dentro: false, discreto: true))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(PideNombre(titulo: ajustes.tr("Nueva lista", "New list"), activo: $creando) { nombre in
            if let l = progreso.creaLista(nombre) { progreso.alternar(id, enLista: l) }
        })
    }
}

private struct ChipLista: ButtonStyle {
    let dentro: Bool
    var discreto = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .frame(minHeight: 36)
            .foregroundStyle(dentro ? Color.black : discreto ? Tema.tinta2 : Tema.tinta)
            .background(dentro ? Tema.oro : Tema.panel2, in: .capsule)
            .overlay(Capsule().strokeBorder(discreto ? Tema.linea : .clear, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            .opacity(configuration.isPressed ? 0.7 : 1)
            .contentShape(.capsule)
    }
}

/// Fila que salta de línea cuando no cabe (los chips de las listas)
struct Fluir: Layout {
    var espacio: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let filas = reparte(ancho: proposal.width ?? .infinity, subviews)
        let alto = filas.map(\.alto).reduce(0, +) + espacio * CGFloat(max(0, filas.count - 1))
        return CGSize(width: proposal.width ?? filas.map(\.ancho).max() ?? 0, height: alto)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for f in reparte(ancho: bounds.width, subviews) {
            var x = bounds.minX
            for i in f.indices {
                let t = subviews[i].sizeThatFits(.init(width: bounds.width, height: nil))
                subviews[i].place(at: CGPoint(x: x, y: y), proposal: .init(width: min(t.width, bounds.width), height: t.height))
                x += min(t.width, bounds.width) + espacio
            }
            y += f.alto + espacio
        }
    }

    private struct Fila { var indices: [Int] = []; var ancho: CGFloat = 0; var alto: CGFloat = 0 }

    private func reparte(ancho: CGFloat, _ subviews: Subviews) -> [Fila] {
        var filas: [Fila] = [Fila()]
        for (i, v) in subviews.enumerated() {
            let t = v.sizeThatFits(.init(width: ancho, height: nil))
            let w = min(t.width, ancho)
            if !filas[filas.count - 1].indices.isEmpty && filas[filas.count - 1].ancho + espacio + w > ancho {
                filas.append(Fila())
            }
            var f = filas[filas.count - 1]
            f.ancho += (f.indices.isEmpty ? 0 : espacio) + w
            f.alto = max(f.alto, t.height)
            f.indices.append(i)
            filas[filas.count - 1] = f
        }
        return filas
    }
}
