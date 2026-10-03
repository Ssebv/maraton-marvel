import SwiftUI
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
                VStack(alignment: .leading, spacing: 20) {
                    cabecera(catalogo, color: color)
                    acciones(catalogo, color: color)
                    if let res = catalogo.texto(titulo.res, en: ajustes.idioma) {
                        Text(res).font(.body).foregroundStyle(Tema.tinta)
                    }
                    if let n = catalogo.texto(titulo.n, en: ajustes.idioma) {
                        Bloque(titulo: ajustes.tr("Antes de verla", "Before watching"), icono: "lightbulb") {
                            Text(n)
                        }
                    }
                    if let larga = detalle?.larga {
                        Bloque(titulo: ajustes.tr("La historia", "The story"), icono: "book") { Text(larga) }
                    }
                    postCreditos(catalogo, detalle: detalle)
                    if titulo.esSerie && !catalogo.episodios(de: titulo.id).isEmpty {
                        Episodios(titulo: titulo, color: color)
                    }
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
                    reparto(catalogo)
                }
                .padding(20)
            }
            .background(Tema.fondo)
        }
    }

    private func cabecera(_ catalogo: Catalogo, color: Color) -> some View {
        HStack(alignment: .bottom, spacing: 16) {
            Poster(url: catalogo.urlPoster(titulo.id, idioma: ajustes.idioma), ancho: 120, radio: Tema.radioL)
                .shadow(color: color.opacity(0.35), radius: 14, y: 8)
            VStack(alignment: .leading, spacing: 6) {
                Text(catalogo.nombre(titulo, en: ajustes.idioma))
                    .font(.title2.weight(.bold)).foregroundStyle(Tema.tinta)
                Text(Formato.meta(titulo, catalogo: catalogo)).font(.subheadline).foregroundStyle(Tema.tinta2)
                if let h = titulo.h, h != "—" {
                    Label(ajustes.tr("Ocurre en \(h)", "Set in \(h)"), systemImage: "clock")
                        .font(.footnote).foregroundStyle(Tema.tinta2)
                }
                if let a = titulo.a { Text(a).font(.footnote).foregroundStyle(Tema.tinta2) }
                if let plat = catalogo.plataforma(titulo, pais: ajustes.pais) {
                    Text(plat)
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(color.opacity(0.15), in: .capsule)
                        .foregroundStyle(color)
                }
            }
        }
    }

    private func acciones(_ catalogo: Catalogo, color: Color) -> some View {
        let visto = progreso.visto(titulo.id)
        return HStack(spacing: 10) {
            Button {
                withAnimation(.snappy) { progreso.alternar(titulo.id) }
            } label: {
                Label(visto ? ajustes.tr("Visto", "Watched") : ajustes.tr("Marcar como visto", "Mark as watched"),
                      systemImage: visto ? "checkmark.circle.fill" : "circle")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(visto ? Tema.panel2 : color)
            .foregroundStyle(visto ? Tema.tinta : .white)
            .buttonBorderShape(.capsule)
            .sensoryFeedback(.success, trigger: visto) { _, nuevo in nuevo }
            if let ref = catalogo.tmdb(titulo.id), let clave = catalogo.claveTMDB {
                Button {
                    Task { await abreTrailer(ref: ref, clave: clave) }
                } label: {
                    Group {
                        if buscandoTrailer { ProgressView() } else { Label(ajustes.tr("Tráiler", "Trailer"), systemImage: "play.fill") }
                    }
                    .font(.body.weight(.semibold))
                    .frame(minWidth: 96, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .disabled(buscandoTrailer)
                .alert(ajustes.tr("No encontré el tráiler", "No trailer found"), isPresented: $sinTrailer) {
                    Button("OK", role: .cancel) {}
                }
            }
        }
    }

    @ViewBuilder
    private func postCreditos(_ catalogo: Catalogo, detalle: Detalle?) -> some View {
        let escenas = detalle?.pcs ?? []
        if let pc = titulo.pc, pc != "0" || !escenas.isEmpty {
            Bloque(titulo: ajustes.tr("Escenas post-créditos", "Post-credit scenes"), icono: "film.stack") {
                Text((Int(pc).map { ajustes.tr("\($0) escenas", "\($0) scenes") } ?? pc) + (titulo.pcn.map { " · " + (catalogo.texto($0, en: ajustes.idioma) ?? $0) } ?? ""))
                    .font(.subheadline.weight(.semibold))
                if !escenas.isEmpty {
                    if verPostCreditos {
                        ForEach(escenas, id: \.self) { e in
                            VStack(alignment: .leading, spacing: 2) {
                                Text([e.cuando, e.t].compactMap { $0 }.joined(separator: " · ")).font(.subheadline.weight(.semibold))
                                if let d = e.d { Text(d) }
                                if let c = e.conecta { Text(c).foregroundStyle(Tema.tinta2) }
                            }
                        }
                    } else {
                        Button(ajustes.tr("Ver qué pasa (spoiler)", "Show what happens (spoiler)")) {
                            withAnimation(.snappy) { verPostCreditos = true }
                        }
                        .font(.subheadline.weight(.semibold))
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func reparto(_ catalogo: Catalogo) -> some View {
        let cast = titulo.cast ?? []
        if !cast.isEmpty || titulo.dir != nil {
            VStack(alignment: .leading, spacing: 10) {
                Text(ajustes.tr("Reparto", "Cast")).font(.headline)
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: 14) {
                        ForEach(cast, id: \.self) { p in
                            VStack(spacing: 6) {
                                Group {
                                    if let img = Imagenes.compartidas.imagen(catalogo.urlFoto(persona: p)) {
                                        Image(uiImage: img).resizable().scaledToFill()
                                    } else {
                                        Tema.panel2.overlay(Image(systemName: "person.fill").foregroundStyle(Tema.tinta3))
                                    }
                                }
                                .frame(width: 72, height: 72)
                                .clipShape(.circle)
                                Text(p).font(.caption).multilineTextAlignment(.center).frame(width: 84)
                            }
                        }
                    }
                }
                .scrollIndicators(.hidden)
                if let dir = titulo.dir {
                    Text(ajustes.tr("Dirección: \(dir)", "Directed by \(dir)")).font(.footnote).foregroundStyle(Tema.tinta2)
                }
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
