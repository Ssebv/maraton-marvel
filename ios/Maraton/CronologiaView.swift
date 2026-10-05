import SwiftUI
import MaratonKit

/// La línea de tiempo de la web en el móvil: cada título es un nodo (su
/// casilla) sobre la línea del color de la era, y cada era es una estación.
struct CronologiaView: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(Ajustes.self) private var ajustes
    @Environment(Progreso.self) private var progreso
    @State private var saga = "xmen"
    @State private var consulta = ""
    /// Los filtros de la web, guardados (como en su URL)
    @AppStorage("filtros") private var filtrosGuardados = 0

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
            botonFiltros(catalogo)
        }
    }

    private var filtros: Filtros { Filtros(rawValue: filtrosGuardados) }

    /// Solo cuentan los filtros que tienen sentido en la saga del título («Solo
    /// express» no vacía Animación) y, al buscar, los que el botón muestra en esta saga
    private func pasa(_ t: Titulo, _ catalogo: Catalogo) -> Bool {
        let utiles = { (s: String) in catalogo.filtrosUtiles(saga: s).reduce(Filtros()) { $0.union($1) } }
        let aplican = filtros.intersection(utiles(catalogo.saga(de: t.id) ?? "")).intersection(utiles(saga))
        return catalogo.pasa(t, aplican, pais: ajustes.pais, visto: progreso.visto(t.id))
    }

    /// «Filtros» con los que sirven en esta saga; el menú no se cierra al tocar
    private func botonFiltros(_ catalogo: Catalogo) -> some View {
        let utiles = catalogo.filtrosUtiles(saga: saga)
        let puestos = utiles.filter { filtros.contains($0) }.count
        return HStack(spacing: 8) {
            Menu {
                ForEach(utiles, id: \.rawValue) { f in
                    Toggle(isOn: Binding(get: { filtros.contains(f) }, set: { on in
                        var nuevo = filtros
                        if on { nuevo.insert(f) } else { nuevo.remove(f) }
                        withAnimation(.snappy) { filtrosGuardados = nuevo.rawValue }
                    })) {
                        Label(nombre(f), systemImage: icono(f))
                    }
                }
            } label: {
                Label(puestos > 0 ? ajustes.tr("Filtros · \(puestos)", "Filters · \(puestos)") : ajustes.tr("Filtros", "Filters"),
                      systemImage: "line.3.horizontal.decrease")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 14)
                    .frame(minHeight: 36)
                    .background(puestos > 0 ? Tema.rojo : .white.opacity(0.12), in: .capsule)
            }
            .menuActionDismissBehavior(.disabled)
            .buttonStyle(.plain)
            if puestos > 0 {
                Button(ajustes.tr("Quitar", "Clear")) { withAnimation(.snappy) { filtrosGuardados = 0 } }
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 12)
                    .frame(minHeight: 36)
                    .buttonStyle(.plain)
            }
        }
    }

    private func nombre(_ f: Filtros) -> String {
        switch f {
        case .sinSeries: ajustes.tr("Sin series", "No series")
        case .sinOpcionales: ajustes.tr("Sin opcionales", "No optional")
        case .joyas: ajustes.tr("Solo joyas (nota 7,5 o más)", "Gems only (rated 7.5+)")
        case .express: ajustes.tr("Solo la ruta express", "Express route only")
        case .disney: ajustes.tr("Solo en Disney+", "Disney+ only")
        default: ajustes.tr("Esconder lo visto", "Hide watched")
        }
    }

    private func icono(_ f: Filtros) -> String {
        switch f {
        case .sinSeries: "tv.slash"
        case .sinOpcionales: "minus.circle"
        case .joyas: "star"
        case .express: "hare"
        case .disney: "play.tv"
        default: "eye.slash"
        }
    }

    /// Cuando los filtros lo esconden todo
    private var vacio: some View {
        ContentUnavailableView {
            Label(ajustes.tr("Nada con estos filtros", "Nothing matches these filters"), systemImage: "line.3.horizontal.decrease")
        } actions: {
            Button(ajustes.tr("Quitar filtros", "Clear filters")) { withAnimation(.snappy) { filtrosGuardados = 0 } }
                .buttonStyle(.bordered)
        }
        .padding(.top, 40)
    }

    private func linea(_ catalogo: Catalogo) -> some View {
        let actual = catalogo.sagas.first { $0.saga == saga }
        let eras = (actual?.eras ?? []).map { era in (era, era.items.filter { pasa($0, catalogo) }) }
        return LazyVStack(alignment: .leading, spacing: 0) {
            if eras.allSatisfy(\.1.isEmpty) { vacio }
            ForEach(eras, id: \.0.id) { era, items in
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
        // sin spoilers: los episodios de lo que no has visto no cuentan
        let todos = catalogo.buscar(consulta) { !ajustes.sinSpoilers || progreso.visto($0.id) }
        let encontrados = todos.filter { pasa($0, catalogo) }
        return LazyVStack(alignment: .leading, spacing: 0) {
            if todos.isEmpty {
                ContentUnavailableView.search(text: consulta).padding(.top, 40)
            } else if encontrados.isEmpty {
                vacio
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
            Button { nav.abre(titulo, desde: "crono:\(titulo.id)") } label: {
                HStack(spacing: 12) {
                    Poster(url: catalogo?.urlPoster(titulo.id, idioma: ajustes.idioma), ancho: 48, radio: Tema.radioS + 2)
                        .origenZoom("crono:\(titulo.id)", radio: Tema.radioS + 2)
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
                            if !visto, let l = progreso.lecturas[titulo.id], l.t > 1 {
                                Etiqueta(texto: ajustes.tr("pág. \(l.p + 1)/\(l.t)", "p. \(l.p + 1)/\(l.t)"))
                            }
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
