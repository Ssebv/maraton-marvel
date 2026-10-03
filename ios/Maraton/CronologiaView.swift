import SwiftUI
import MaratonKit

/// La lista en orden de visionado, por saga y era, con su casilla
struct CronologiaView: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(Ajustes.self) private var ajustes
    @State private var saga = "xmen"
    @State private var consulta = ""
    @State private var soloExpress = false

    var body: some View {
        NavigationStack {
            Group {
                if let catalogo {
                    if consulta.trimmingCharacters(in: .whitespaces).isEmpty {
                        lista(catalogo)
                    } else {
                        resultados(catalogo)
                    }
                }
            }
            .background(Tema.fondo)
            .scrollContentBackground(.hidden)
            .navigationTitle(ajustes.tr("Cronología", "Timeline"))
            .searchable(text: $consulta, prompt: ajustes.tr("Título, actor o director", "Title, actor or director"))
        }
    }

    private func lista(_ catalogo: Catalogo) -> some View {
        let actual = catalogo.sagas.first { $0.saga == saga }
        return List {
            Section {
                Picker(ajustes.tr("Saga", "Saga"), selection: $saga) {
                    ForEach(catalogo.sagas) { s in Text(nombreCorto(s.saga)).tag(s.saga) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
                if saga == "ucm" {
                    Toggle(ajustes.tr("Solo la ruta express", "Express route only"), isOn: $soloExpress)
                        .listRowBackground(Tema.panel)
                }
            }
            ForEach(actual?.eras ?? []) { era in
                let items = era.items.filter { !soloExpress || saga != "ucm" || $0.esExpress }
                if !items.isEmpty {
                    Section {
                        ForEach(items) { t in
                            FilaTitulo(titulo: t, color: Color(hex: era.c?.first) ?? Tema.color(saga: saga))
                                .listRowBackground(Tema.panel)
                        }
                    } header: {
                        HStack(spacing: 8) {
                            Circle().fill(Color(hex: era.c?.first) ?? Tema.tinta3).frame(width: 10, height: 10)
                            Text(catalogo.texto(era.era, en: ajustes.idioma) ?? era.era)
                            Spacer()
                            if let r = era.rango { Text(r).monospacedDigit() }
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Tema.tinta2)
                        .textCase(nil)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .animation(.snappy, value: soloExpress)
    }

    private func resultados(_ catalogo: Catalogo) -> some View {
        let encontrados = catalogo.buscar(consulta)
        return List {
            ForEach(encontrados) { t in
                FilaTitulo(titulo: t, color: Tema.color(saga: catalogo.saga(de: t.id)))
                    .listRowBackground(Tema.panel)
            }
        }
        .listStyle(.insetGrouped)
        .overlay {
            if encontrados.isEmpty { ContentUnavailableView.search(text: consulta) }
        }
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

struct FilaTitulo: View {
    let titulo: Titulo
    let color: Color
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        HStack(spacing: 12) {
            Button { nav.ficha = titulo } label: {
                HStack(spacing: 12) {
                    Poster(url: catalogo?.urlPoster(titulo.id, idioma: ajustes.idioma), ancho: 44, radio: Tema.radioS + 2)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(catalogo?.nombre(titulo, en: ajustes.idioma) ?? titulo.t)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(progreso.visto(titulo.id) ? Tema.tinta2 : Tema.tinta)
                        HStack(spacing: 6) {
                            if let catalogo { Text(Formato.meta(titulo, catalogo: catalogo)) }
                            if titulo.esOpcional { Etiqueta(texto: ajustes.tr("Opcional", "Optional")) }
                        }
                        .font(.caption).foregroundStyle(Tema.tinta2)
                        if titulo.esSerie, progreso.vistosDe(serie: titulo.id).total > 0 {
                            let (v, t) = progreso.vistosDe(serie: titulo.id)
                            if v > 0 && v < t { Barra(fraccion: Double(v) / Double(t), color: color).frame(maxWidth: 120) }
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            Casilla(marcada: progreso.visto(titulo.id), color: color) {
                withAnimation(.snappy) { progreso.alternar(titulo.id) }
            }
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
