import SwiftUI
import MaratonKit

/// Inicio como el de la web: cabecera con la marca sobre un fotograma, el
/// progreso y la cuenta atrás; una tarjeta por saga con «Sigue: …»; el
/// siguiente título en grande y un carrusel por saga.
struct InicioView: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(\.scenePhase) private var fase
    @State private var noticiero = Noticiero()

    var body: some View {
        NavigationStack {
            ScrollView {
                if let catalogo {
                    VStack(alignment: .leading, spacing: 0) {
                        Cabecera(catalogo: catalogo)
                        VStack(alignment: .leading, spacing: 28) {
                            DesdeTuUltimaVisita()
                            TarjetasSaga(catalogo: catalogo)
                            Portada(catalogo: catalogo)
                            TarjetaHorario(catalogo: catalogo).ancla("horario")
                            Estrenos(catalogo: catalogo).ancla("estrenos")
                            NoticiasInicio(noticiero: noticiero).ancla("noticias")
                            Favoritas(catalogo: catalogo)
                            ForEach(catalogo.sagas) { saga in Carrusel(saga: saga, catalogo: catalogo) }
                        }
                        .padding(.top, 18)
                        .padding(.bottom, 24)
                    }
                }
            }
            .conAnclaDepuracion()
            .refreshable { await noticiero.actualiza(forzando: true) }
            .task(id: fase) { if fase == .active { await noticiero.actualiza() } }
            .background(Tema.fondo)
            .ignoresSafeArea(edges: .top)
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}

private struct Cabecera: View {
    let catalogo: Catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        let r = progreso.resumen
        let pct = Int((r.fraccion * 100).rounded())
        // «564 h» como la web; por debajo de una hora, los minutos
        let quedan = r.minutosRestantes < 60 ? Formato.duracion(r.minutosRestantes) : "\((r.minutosRestantes + 30) / 60) h"
        VStack(alignment: .leading, spacing: 12) {
            Marca(tamano: 32)
            BarraMarca(fraccion: r.fraccion)
                .padding(.top, 6)
            Text(LocalizedStringKey(ajustes.tr("**\(r.vistos)** / \(r.total) completados · \(pct) % · te quedan **\(quedan)**",
                                               "**\(r.vistos)** / \(r.total) done · \(pct) % · **\(quedan)** to go")))
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.white.opacity(0.85))
                .contentTransition(.numericText(value: Double(r.vistos)))
            if let (e, dias) = catalogo.proximoEstreno() {
                Button {
                    nav.abre(e.id.flatMap(catalogo.titulo))
                } label: {
                    let cuando = dias == 0 ? ajustes.tr("¡hoy!", "today!")
                        : dias == 1 ? ajustes.tr("mañana", "tomorrow")
                        : ajustes.tr("en \(dias) días", "in \(dias) days")
                    Text("\(Text(nombreCorto(e.t)).bold()) \(Text(cuando).foregroundStyle(Tema.verde).bold())")
                        .font(.subheadline)
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 70)
        .padding(.bottom, 22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack {
                // el fondo del próximo estreno, como en la web (Doomsday)
                Fotograma(remota: nil, local: catalogo.urlLocal(catalogo.proximoEstreno()?.estreno.img)
                    ?? catalogo.urlFondo(saga: "ucm"))
                Velo()
            }
        }
        .environment(\.colorScheme, .dark)
    }

    /// «Vengadores: Doomsday» → «Doomsday»
    private func nombreCorto(_ t: String) -> String {
        t.split(separator: ":").last.map { $0.trimmingCharacters(in: .whitespaces) } ?? t
    }
}

/// X-Men y UCM: progreso y el siguiente de cada una, con el brillo de su color
private struct TarjetasSaga: View {
    let catalogo: Catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        HStack(spacing: 12) {
            ForEach(catalogo.sagas.filter { catalogo.idsMaraton.contains($0.eras.first?.items.first?.id ?? "") }) { saga in
                tarjeta(saga)
            }
        }
        .padding(.horizontal, 16)
    }

    private func tarjeta(_ saga: Saga) -> some View {
        let color = Tema.color(saga: saga.saga)
        let items = saga.eras.flatMap(\.items)
        let vistos = items.filter { progreso.visto($0.id) }.count
        let sigue = progreso.siguiente { catalogo.saga(de: $0.id) == saga.saga }
        return Button {
            nav.abre(sigue, desde: "sigue:\(saga.saga)")
        } label: {
            HStack(spacing: 10) {
                Poster(url: sigue.flatMap { catalogo.urlPoster($0.id, idioma: ajustes.idioma) }, ancho: 40, radio: Tema.radioS + 2)
                    .origenZoom("sigue:\(saga.saga)", radio: Tema.radioS + 2)
                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Rotulo(texto: saga.saga == "xmen" ? "X-Men" : ajustes.tr("UCM", "MCU"), color: color)
                        Spacer(minLength: 4)
                        Text("\(vistos) / \(items.count)").font(.caption.weight(.semibold).monospacedDigit())
                    }
                    Text(sigue.map { ajustes.tr("Sigue: ", "Next: ") + catalogo.nombre($0, en: ajustes.idioma) }
                         ?? ajustes.tr("Completa", "Complete"))
                        .font(.caption)
                        .lineLimit(1)
                        .foregroundStyle(Tema.tinta2)
                    Barra(fraccion: items.isEmpty ? 0 : Double(vistos) / Double(items.count), color: color)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity)
            .background(Tema.panel, in: .rect(cornerRadius: Tema.radioL))
            .overlay(RoundedRectangle(cornerRadius: Tema.radioL).strokeBorder(color.opacity(0.7), lineWidth: 1.5))
            .shadow(color: color.opacity(0.28), radius: 12, y: 4)
        }
        .buttonStyle(.plain)
    }
}

/// El siguiente título en grande, sobre su fotograma
private struct Portada: View {
    let catalogo: Catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        if let t = progreso.siguiente() {
            let saga = catalogo.saga(de: t.id)
            let color = Tema.color(saga: saga)
            let pos = catalogo.posicionEnSaga(t.id).map { " · \($0.posicion) / \($0.total)" } ?? ""
            VStack(alignment: .leading, spacing: 10) {
                Spacer(minLength: 0)
                Rotulo(texto: ajustes.tr("Siguiente en \(saga == "xmen" ? "X-Men" : "UCM")\(pos)",
                                         "Next in \(saga == "xmen" ? "X-Men" : "MCU")\(pos)"),
                       color: .white, punto: color)
                Text(catalogo.nombre(t, en: ajustes.idioma))
                    .font(.title.weight(.bold))
                    .foregroundStyle(.white)
                Text([Formato.meta(t, catalogo: catalogo), catalogo.plataforma(t, pais: ajustes.pais)]
                        .compactMap { $0 }.joined(separator: " · "))
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.8))
                HStack(spacing: 10) {
                    Button {
                        withAnimation(.snappy) { progreso.alternar(t.id) }
                    } label: {
                        Label(ajustes.tr("Marcar como vista", "Mark as seen"), systemImage: "checkmark")
                            .font(.body.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(color)
                    .shadow(color: color.opacity(0.45), radius: 10, y: 4)
                    Button { nav.abre(t, desde: "destacado") } label: {
                        Label(ajustes.tr("Ficha", "Details"), systemImage: "info.circle")
                            .font(.body.weight(.semibold))
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .tint(.white)
                }
                .buttonBorderShape(.capsule)
            }
            .padding(18)
            .frame(maxWidth: .infinity, minHeight: 330, alignment: .leading)
            .background {
                ZStack {
                    Fotograma(remota: catalogo.urlFotograma(t.id), local: catalogo.urlPoster(t.id), color: color)
                    Velo()
                }
            }
            .clipShape(.rect(cornerRadius: Tema.radioXL))
            .origenZoom("destacado", radio: Tema.radioXL)
            .shadow(color: .black.opacity(0.25), radius: 18, y: 10)
            .padding(.horizontal, 16)
            .environment(\.colorScheme, .dark)
            .onTapGesture { nav.abre(t, desde: "destacado") }
        }
    }
}

/// Lo que viene: una tarjeta por estreno con su cuenta atrás (o «Otoño de 2026»)
private struct Estrenos: View {
    let catalogo: Catalogo
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        let lista = catalogo.estrenosPendientes()
        if !lista.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(ajustes.tr("Próximos estrenos", "Coming soon")).font(.title3.weight(.bold))
                    Spacer()
                    CampanaEstrenos()
                }
                .padding(.horizontal, 16)
                ScrollView(.horizontal) {
                    LazyHStack(alignment: .top, spacing: 12) {
                        ForEach(lista, id: \.estreno) { e in tarjeta(e.estreno, dias: e.dias) }
                    }
                    .padding(.horizontal, 16)
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.viewAligned)
                .scrollIndicators(.hidden)
            }
        }
    }

    private func tarjeta(_ e: Estreno, dias: Int?) -> some View {
        let titulo = e.id.flatMap { catalogo.titulo($0) }
        let cuando: String = switch dias {
        case 0: ajustes.tr("¡Hoy!", "Today!")
        case 1: ajustes.tr("Mañana", "Tomorrow")
        case let n?: ajustes.tr("En \(n) días", "In \(n) days")
        case nil: catalogo.texto(e.aprox, en: ajustes.idioma) ?? ajustes.tr("Sin fecha", "TBA")
        }
        return Button {
            nav.abre(titulo, desde: "estreno:\(e.t)")
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                Spacer(minLength: 0)
                Text(cuando)
                    .font(.caption.weight(.bold).monospacedDigit())
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(dias == nil ? .white.opacity(0.18) : Tema.verde.opacity(0.9), in: .capsule)
                Text(titulo.map { catalogo.nombre($0, en: ajustes.idioma) } ?? catalogo.texto(e.t, en: ajustes.idioma) ?? e.t)
                    .font(.headline)
                    .lineLimit(2)
                if let tipo = catalogo.texto(e.tipo, en: ajustes.idioma) {
                    Text([tipo, fecha(e.fecha)].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption.weight(.semibold)).opacity(0.75)
                }
                if let n = catalogo.texto(e.n, en: ajustes.idioma) {
                    Text(n).font(.caption).opacity(0.85).lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .foregroundStyle(.white)
            .padding(14)
            .frame(width: 250, height: 230, alignment: .leading)
            .background {
                ZStack {
                    Fotograma(remota: nil, local: catalogo.urlImagen(estreno: e), color: Tema.azul)
                    Velo()
                }
            }
            .clipShape(.rect(cornerRadius: Tema.radioXL))
            .origenZoom("estreno:\(e.t)", radio: Tema.radioXL)
            .environment(\.colorScheme, .dark)
        }
        .buttonStyle(.plain)
        .allowsHitTesting(titulo != nil)  // sin ficha: no se apaga, solo no responde
        .accessibilityElement(children: .combine)
    }

    /// «2026-12-18» → «18 dic 2026»
    private func fecha(_ s: String?) -> String? {
        guard let s, let d = try? Date(s, strategy: .iso8601.year().month().day()) else { return nil }
        // la fecha se lee en UTC: se muestra en UTC para que en Chile no salga el día anterior
        return d.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted,
                                            locale: Locale(identifier: ajustes.idioma == .en ? "en_US" : "es_CL"),
                                            timeZone: .gmt))
    }
}

private struct Carrusel: View {
    let saga: Saga
    let catalogo: Catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        let titulos = saga.eras.flatMap(\.items)
        let vistos = titulos.filter { progreso.visto($0.id) }.count
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(catalogo.texto(saga.titulo, en: ajustes.idioma) ?? saga.titulo).font(.title3.weight(.bold))
                Spacer()
                Text("\(vistos)/\(titulos.count)")
                    .font(.footnote.monospacedDigit()).foregroundStyle(Tema.tinta2)
            }
            .padding(.horizontal, 16)
            ScrollView(.horizontal) {
                LazyHStack(spacing: 12) {
                    ForEach(titulos) { t in
                        Button { nav.abre(t, desde: "fila:\(t.id)") } label: {
                            Poster(url: catalogo.urlPoster(t.id, idioma: ajustes.idioma), ancho: 104)
                                .origenZoom("fila:\(t.id)")
                                .overlay {
                                    if progreso.visto(t.id) { SelloVista().scaleEffect(0.8) }
                                }
                        }
                        .buttonStyle(.plain)
                        .menuTitulo(t)
                        .accessibilityLabel(catalogo.nombre(t, en: ajustes.idioma))
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
        }
    }
}

/// Lo que valoraste con 4 o 5 estrellas, de más a menos (como «Tus favoritas» de la web)
private struct Favoritas: View {
    let catalogo: Catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        // con las mismas estrellas, en el orden del maratón
        let lista = catalogo.titulos.enumerated()
            .compactMap { i, t in progreso.notas[t.id]?.p.map { (t, $0, i) } }
            .filter { $0.1 >= 4 }
            .sorted { ($1.1, $0.2) < ($0.1, $1.2) }
            .map { ($0.0, $0.1) }
        if !lista.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(ajustes.tr("Tus favoritas", "Your favorites")).font(.title3.weight(.bold))
                    .padding(.horizontal, 16)
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 12) {
                        ForEach(lista, id: \.0.id) { t, p in
                            Button { nav.abre(t, desde: "favoritas:\(t.id)") } label: {
                                Poster(url: catalogo.urlPoster(t.id, idioma: ajustes.idioma), ancho: 104)
                                    .origenZoom("favoritas:\(t.id)")
                                    .overlay(alignment: .bottomLeading) {
                                        Estrellas(n: p, color: Tema.oroVivo)
                                        .padding(.horizontal, 6).padding(.vertical, 4)
                                        .background(.black.opacity(0.7), in: .capsule)
                                        .padding(6)
                                    }
                            }
                            .buttonStyle(.plain)
                            .menuTitulo(t)
                            .accessibilityLabel(catalogo.nombre(t, en: ajustes.idioma))
                            .accessibilityValue(ajustes.tr("\(p) estrellas", "\(p) stars"))
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .scrollIndicators(.hidden)
            }
        }
    }
}

/// La campana de «Próximos estrenos»: avisar el día de cada estreno
private struct CampanaEstrenos: View {
    @Environment(Agenda.self) private var agenda
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        let on = agenda.avisosEstrenos
        Button {
            Task { if on { agenda.avisosEstrenos = false } else { await agenda.activaEstrenos() } }
        } label: {
            Label(on ? ajustes.tr("Te avisaré", "On") : ajustes.tr("Avisarme", "Notify me"),
                  systemImage: on ? "bell.fill" : "bell")
                .font(.subheadline.weight(.semibold))
                .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.capsule)
        .tint(on ? Tema.oro : Tema.tinta2)
        .sensoryFeedback(.selection, trigger: on)
        .accessibilityHint(ajustes.tr("Un aviso el día de cada estreno", "A notification on each premiere day"))
    }
}

/// «Desde tu última visita: Vision Quest ya se estrenó» (se cierra con ✕)
private struct DesdeTuUltimaVisita: View {
    @Environment(Navegacion.self) private var nav
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        if !nav.novedades.isEmpty {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "sparkles").foregroundStyle(Tema.oro).font(.title3)
                (Text(ajustes.tr("Desde tu última visita: ", "Since your last visit: ")).bold()
                    + Text(nav.novedades.joined(separator: " · ")))
                    .font(.subheadline).foregroundStyle(Tema.tinta)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button {
                    withAnimation(.snappy) { nav.novedades = [] }
                } label: {
                    Image(systemName: "xmark").font(.footnote.weight(.bold)).foregroundStyle(Tema.tinta2)
                        .frame(width: 32, height: 32)
                }
                .accessibilityLabel(ajustes.tr("Cerrar aviso", "Dismiss"))
            }
            .padding(14)
            .superficie(radio: Tema.radioL)
            .padding(.horizontal, 16)
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }
}
