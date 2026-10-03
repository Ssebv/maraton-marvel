import SwiftUI
import MaratonKit

/// La línea de tiempo de la web en el móvil: cada título es un nodo (su
/// casilla) sobre la línea del color de la era, y cada era es una estación.
struct CronologiaView: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(Ajustes.self) private var ajustes
    @State private var saga = "xmen"
    @State private var consulta = ""
    @State private var soloExpress = false

    var body: some View {
        NavigationStack {
            ScrollView {
                if let catalogo {
                    VStack(alignment: .leading, spacing: 0) {
                        cabecera(catalogo)
                        if consulta.trimmingCharacters(in: .whitespaces).isEmpty {
                            linea(catalogo)
                        } else {
                            resultados(catalogo)
                        }
                    }
                }
            }
            .scrollDismissesKeyboard(.immediately)
            .background(Tema.fondo)
            .ignoresSafeArea(edges: .top)
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private func cabecera(_ catalogo: Catalogo) -> some View {
        let actual = catalogo.sagas.first { $0.saga == saga }
        let primero = actual?.eras.first?.items.first?.id
        return CabeceraPestana(titulo: ajustes.tr("Cronología", "Timeline"),
                               fotograma: catalogo.urlFondo(saga: saga) == nil ? primero.flatMap { catalogo.urlFotograma($0) } : nil,
                               fondo: catalogo.urlFondo(saga: saga),
                               color: Tema.color(saga: saga)) {
            CampoBuscar(texto: $consulta, placeholder: ajustes.tr("Título, episodio o actor", "Title, episode or actor"))
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(catalogo.sagas) { s in
                        let elegida = s.saga == saga
                        Button {
                            withAnimation(.snappy) { saga = s.saga; consulta = "" }
                        } label: {
                            Text(nombreCorto(s.saga))
                                .font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 14)
                                .frame(minHeight: 36)
                                .background(elegida ? Tema.color(saga: s.saga) : .white.opacity(0.12), in: .capsule)
                                .shadow(color: elegida ? Tema.color(saga: s.saga).opacity(0.5) : .clear, radius: 8, y: 3)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(elegida ? .isSelected : [])
                    }
                }
            }
            .scrollIndicators(.hidden)
            if saga == "ucm" {
                Toggle(ajustes.tr("Solo la ruta express", "Express route only"), isOn: $soloExpress.animation(.snappy))
                    .font(.subheadline.weight(.semibold))
                    .tint(Tema.rojo)
            }
        }
    }

    private func linea(_ catalogo: Catalogo) -> some View {
        let actual = catalogo.sagas.first { $0.saga == saga }
        return LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(actual?.eras ?? []) { era in
                let items = era.items.filter { !soloExpress || saga != "ucm" || $0.esExpress }
                if !items.isEmpty {
                    let color = Color(hex: era.c?.first) ?? Tema.color(saga: saga)
                    Estacion(era: era, color: color, items: items)
                    ForEach(items) { t in Nodo(titulo: t, color: color) }
                }
            }
        }
        .padding(.top, 8)
        .padding(.bottom, 24)
    }

    private func resultados(_ catalogo: Catalogo) -> some View {
        let encontrados = catalogo.buscar(consulta)
        return LazyVStack(alignment: .leading, spacing: 0) {
            if encontrados.isEmpty {
                ContentUnavailableView.search(text: consulta).padding(.top, 40)
            }
            ForEach(encontrados) { t in
                Nodo(titulo: t, color: Tema.color(saga: catalogo.saga(de: t.id)), conLinea: false)
            }
        }
        .padding(.vertical, 8)
    }

    private func nombreCorto(_ saga: String) -> String {
        switch saga {
        case "xmen": "X-Men"
        case "ucm": ajustes.tr("UCM", "MCU")
        case "animacion": ajustes.tr("Animación", "Animation")
        case "comics": ajustes.tr("Cómics", "Comics")
        default: saga
        }
    }
}

/// Ancho de la columna de la línea (el nodo mide 44 para el dedo)
private let columna: CGFloat = 56

/// Una era: nodo grande con su nombre, su rango y cuántas llevas
private struct Estacion: View {
    let era: Era
    let color: Color
    let items: [Titulo]
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        let vistos = items.filter { progreso.visto($0.id) }.count
        HStack(spacing: 0) {
            ZStack {
                LineaVertical(color: color)
                Circle().fill(color).frame(width: 22, height: 22)
                    .overlay(Circle().strokeBorder(Tema.fondo, lineWidth: 4))
                    .shadow(color: color.opacity(0.6), radius: 6)
            }
            .frame(width: columna)
            VStack(alignment: .leading, spacing: 2) {
                Text(catalogo?.texto(era.era, en: ajustes.idioma) ?? era.era)
                    .font(.title3.weight(.bold)).foregroundStyle(Tema.tinta)
                HStack(spacing: 6) {
                    if let r = era.rango { Text(r).monospacedDigit() }
                    Text("· \(vistos)/\(items.count)").monospacedDigit()
                }
                .font(.footnote.weight(.semibold)).foregroundStyle(color)
            }
            .padding(.vertical, 16)
            Spacer(minLength: 16)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct LineaVertical: View {
    let color: Color
    var body: some View {
        Rectangle().fill(color.opacity(0.55)).frame(width: 3).frame(maxHeight: .infinity)
    }
}

/// Un título: la casilla es el nodo sobre la línea
struct Nodo: View {
    let titulo: Titulo
    let color: Color
    var conLinea = true
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        let visto = progreso.visto(titulo.id)
        HStack(spacing: 0) {
            ZStack {
                if conLinea { LineaVertical(color: color) }
                Casilla(marcada: visto, color: color) {
                    withAnimation(.snappy) { progreso.alternar(titulo.id) }
                }
                .background(Circle().fill(Tema.fondo).frame(width: 30, height: 30))
            }
            .frame(width: columna)
            Button { nav.ficha = titulo } label: {
                HStack(spacing: 12) {
                    Poster(url: catalogo?.urlPoster(titulo.id, idioma: ajustes.idioma), ancho: 48, radio: Tema.radioS + 2)
                        .opacity(visto ? 0.6 : 1)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(catalogo?.nombre(titulo, en: ajustes.idioma) ?? titulo.t)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(visto ? Tema.tinta2 : Tema.tinta)
                        HStack(spacing: 6) {
                            if let h = titulo.h, h != "—" { Text(h).foregroundStyle(color).bold() }
                            if let catalogo { Text(Formato.meta(titulo, catalogo: catalogo)) }
                        }
                        .font(.caption).foregroundStyle(Tema.tinta2)
                        HStack(spacing: 6) {
                            if titulo.esExpress { Etiqueta(texto: "Express") }
                            if titulo.esOpcional { Etiqueta(texto: ajustes.tr("Opcional", "Optional")) }
                            if titulo.esSerie, case let (v, t) = progreso.vistosDe(serie: titulo.id), t > 0, v > 0, v < t {
                                Barra(fraccion: Double(v) / Double(t), color: color).frame(width: 90)
                            }
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 8)
                .padding(.trailing, 16)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
        }
    }
}

struct Etiqueta: View {
    let texto: String
    var body: some View {
        Text(texto)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Tema.panel2, in: .capsule)
    }
}
