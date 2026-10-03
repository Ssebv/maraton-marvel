import SwiftUI
import MaratonKit

/// Inicio como el de la web: cabecera con la marca sobre un fotograma, el
/// progreso y la cuenta atrás; una tarjeta por saga con «Sigue: …»; el
/// siguiente título en grande y un carrusel por saga.
struct InicioView: View {
    @Environment(\.catalogo) private var catalogo

    var body: some View {
        NavigationStack {
            ScrollView {
                if let catalogo {
                    VStack(alignment: .leading, spacing: 0) {
                        Cabecera(catalogo: catalogo)
                        VStack(alignment: .leading, spacing: 28) {
                            TarjetasSaga(catalogo: catalogo)
                            Portada(catalogo: catalogo)
                            ForEach(catalogo.sagas) { saga in Carrusel(saga: saga, catalogo: catalogo) }
                        }
                        .padding(.top, 18)
                        .padding(.bottom, 24)
                    }
                }
            }
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
                    if let id = e.id, let t = catalogo.titulo(id) { nav.ficha = t }
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
            if let sigue { nav.ficha = sigue }
        } label: {
            HStack(spacing: 10) {
                Poster(url: sigue.flatMap { catalogo.urlPoster($0.id, idioma: ajustes.idioma) }, ancho: 40, radio: Tema.radioS + 2)
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
                    Button { nav.ficha = t } label: {
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
            .shadow(color: .black.opacity(0.25), radius: 18, y: 10)
            .padding(.horizontal, 16)
            .environment(\.colorScheme, .dark)
            .onTapGesture { nav.ficha = t }
        }
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
                        Button { nav.ficha = t } label: {
                            Poster(url: catalogo.urlPoster(t.id, idioma: ajustes.idioma), ancho: 104)
                                .overlay {
                                    if progreso.visto(t.id) { SelloVista().scaleEffect(0.8) }
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(catalogo.nombre(t, en: ajustes.idioma))
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
        }
    }
}
