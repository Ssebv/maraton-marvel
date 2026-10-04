import SwiftUI
import UIKit
import MaratonKit

struct ProgresoView: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @State private var ruta: [RutaLista] = []
    #if DEBUG
    @State private var listaDepuracionAbierta = false
    #endif

    var body: some View {
        NavigationStack(path: $ruta) {
            ScrollView {
                let r = progreso.resumen
                VStack(alignment: .leading, spacing: 0) {
                    CabeceraPestana(titulo: ajustes.tr("Progreso", "Progress"),
                                    fondo: catalogo?.urlFondo(saga: "ucm")) {
                        // el odómetro: las cifras ruedan al cambiar
                        Text("\(Int((r.fraccion * 100).rounded())) %")
                            .font(Tema.marca(64).monospacedDigit())
                            .contentTransition(.numericText(value: r.fraccion))
                        BarraMarca(fraccion: r.fraccion, alto: 9)
                        HStack {
                            Dato(valor: "\(r.vistos)/\(r.total)", texto: ajustes.tr("títulos", "titles"))
                            Spacer()
                            Dato(valor: Formato.duracion(r.minutosVistos), texto: ajustes.tr("vistas", "watched"))
                            Spacer()
                            Dato(valor: Formato.duracion(r.minutosRestantes), texto: ajustes.tr("por ver", "to go"))
                        }
                    }
                    .animation(.snappy, value: r)
                    VStack(spacing: 12) {
                        ForEach(catalogo?.sagas ?? []) { saga in
                            let items = saga.eras.flatMap(\.items)
                            let vistos = items.filter { progreso.visto($0.id) }.count
                            let color = Tema.color(saga: saga.saga)
                            HStack(spacing: 14) {
                                Fotograma(remota: nil, local: catalogo?.urlFondo(saga: saga.saga)
                                          ?? items.first.flatMap { catalogo?.urlPoster($0.id) }, color: color)
                                    .frame(width: 56, height: 56)
                                    .clipShape(.rect(cornerRadius: Tema.radioM))
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack {
                                        Text(catalogo?.texto(saga.titulo, en: ajustes.idioma) ?? saga.titulo).font(.headline)
                                        Spacer()
                                        Text("\(vistos)/\(items.count)").font(.subheadline.weight(.semibold).monospacedDigit())
                                            .foregroundStyle(color)
                                    }
                                    Barra(fraccion: items.isEmpty ? 0 : Double(vistos) / Double(items.count), color: color)
                                }
                            }
                            .padding(14)
                            .superficie(radio: Tema.radioL)
                        }
                        SeccionListas().padding(.top, 16).ancla("listas")
                        SeccionTuMes().padding(.top, 16).ancla("mes")
                        SeccionDiario()
                        SeccionLogros().padding(.top, 16).ancla("logros")
                    }
                    .padding(16)
                }
            }
            .conAnclaDepuracion()
            .background(Tema.fondo)
            .ignoresSafeArea(edges: .top)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: RutaLista.self) { ListaView(id: $0.id) }
            #if DEBUG
            // capturas: `-abrirLista <id>`
            // (una vez: la tarea de la raíz vuelve a correr al volver atrás)
            .task {
                guard !listaDepuracionAbierta, let id = UserDefaults.standard.string(forKey: "abrirLista") else { return }
                listaDepuracionAbierta = true
                ruta = [RutaLista(id: id)]
            }
            #endif
        }
    }
}

private struct Dato: View {
    let valor: String
    let texto: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(valor).font(.headline.monospacedDigit())
            Text(texto).font(.caption).opacity(0.75)
        }
    }
}

struct AjustesView: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav
    @Environment(Agenda.self) private var agenda
    @Environment(Biblioteca.self) private var biblioteca
    @State private var pegado = ""

    var body: some View {
        @Bindable var ajustes = ajustes
        NavigationStack {
            Form {
                Section(ajustes.tr("Idioma y país", "Language and country")) {
                    Picker(ajustes.tr("Títulos", "Titles"), selection: $ajustes.idioma) {
                        Text("Español (España)").tag(Idioma.es)
                        Text("Español (Latinoamérica)").tag(Idioma.latam)
                        Text("English").tag(Idioma.en)
                    }
                    Picker(ajustes.tr("Dónde ver en", "Where to watch in"), selection: $ajustes.pais) {
                        ForEach(catalogo?.paises ?? []) { p in Text(p.nombre).tag(p.id) }
                    }
                }
                Section {
                    Toggle(isOn: Binding(get: { agenda.avisosEstrenos }, set: { on in
                        Task { if on { await agenda.activaEstrenos() } else { agenda.avisosEstrenos = false } }
                    })) {
                        Label(ajustes.tr("Avisos de estreno", "Premiere alerts"), systemImage: "bell.badge")
                    }
                    .tint(Tema.verde)
                } header: {
                    Text(ajustes.tr("Estrenos", "Premieres"))
                } footer: {
                    Text(ajustes.tr("Un aviso a las \(Agenda.horaEstreno):00 del día de cada estreno y de los episodios nuevos de las series que sigues.",
                                    "A notification at \(Agenda.horaEstreno):00 on each premiere day and when series you follow get new episodes."))
                }
                Section(ajustes.tr("Horario de maratón", "Marathon schedule")) {
                    Button { nav.horarioAbierto = true } label: {
                        LabeledContent {
                            Text(agenda.horario.map(resumenHorario) ?? ajustes.tr("Sin horario", "No schedule"))
                        } label: {
                            Label(ajustes.tr("Tu horario", "Your schedule"), systemImage: "calendar.badge.clock")
                                .foregroundStyle(Tema.tinta)
                        }
                    }
                }
                Section {
                    TextField(ajustes.tr("Pega el código o el enlace", "Paste the code or link"), text: $pegado)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button(ajustes.tr("Importar progreso", "Import progress")) { importa() }
                        .disabled(pegado.isEmpty)
                    if let catalogo, let url = enlace(catalogo) {
                        ShareLink(item: url) {
                            Label(ajustes.tr("Compartir mi progreso", "Share my progress"), systemImage: "square.and.arrow.up")
                        }
                    }
                } header: {
                    Text(ajustes.tr("Pasar el progreso", "Move your progress"))
                } footer: {
                    Text(ajustes.tr("En la web: Ajustes › Tu progreso › «Copiar código», y pégalo aquí. También sirve el enlace de «Compartir mi progreso» de otro iPhone. Se suma a lo marcado; no se borra nada.",
                                    "On the web: Settings › Your progress › “Copy code”, then paste it here. A “Share my progress” link from another iPhone works too. It adds to what you marked; nothing is erased."))
                }
                if let catalogo, !biblioteca.archivos.isEmpty { tusComics(catalogo) }
                Section(ajustes.tr("Acerca de", "About")) {
                    Text(ajustes.tr("App no oficial, sin relación con Marvel ni Disney. Los nombres y personajes son de sus dueños.",
                                    "Unofficial app, not affiliated with Marvel or Disney. Names and characters belong to their owners."))
                    Text("This product uses the TMDB API but is not endorsed or certified by TMDB.")
                }
                .font(.footnote)
                .foregroundStyle(Tema.tinta2)
            }
            .scrollContentBackground(.hidden)
            .background(Tema.fondo)
            .navigationTitle(ajustes.tr("Ajustes", "Settings"))
        }
    }

    /// Los archivos de cómic guardados, en el orden del maratón; deslizar borra
    private func tusComics(_ catalogo: Catalogo) -> some View {
        let ids = catalogo.titulos.map(\.id).filter { biblioteca.archivos[$0] != nil }
        return Section {
            ForEach(ids, id: \.self) { id in
                if let t = catalogo.titulo(id), let a = biblioteca.archivos[id] {
                    Button { nav.ficha = t } label: {
                        LabeledContent {
                            Text(a.tam.formatted(.byteCount(style: .file)))
                        } label: {
                            Text(catalogo.nombre(t, en: ajustes.idioma)).foregroundStyle(Tema.tinta)
                            Text(a.tipo == .imagenes && Int(a.nombre) != nil ? ajustes.tr("\(a.nombre) imágenes", "\(a.nombre) images") : a.nombre)
                        }
                    }
                }
            }
            .onDelete { filas in
                for i in filas { biblioteca.quita(ids[i]); progreso.olvidaLectura(ids[i]) }
            }
        } header: {
            Text(ajustes.tr("Tus cómics", "Your comics"))
        } footer: {
            Text(ajustes.tr("Ocupan \(biblioteca.total.formatted(.byteCount(style: .file))) en este iPhone. Desliza para quitar uno; lo marcado se queda.",
                            "They take \(biblioteca.total.formatted(.byteCount(style: .file))) on this iPhone. Swipe to remove one; your marks stay."))
        }
    }

    private func enlace(_ catalogo: Catalogo) -> URL? {
        let (v, e) = progreso.exporta()
        return Enlace.crea(v: v, e: e)
    }

    private func importa() {
        let texto = pegado.trimmingCharacters(in: .whitespacesAndNewlines)
        let r: Progreso.Importado
        if let url = URL(string: texto), let (v, e) = Enlace.lee(url) {
            r = progreso.importa(v: v, e: e)
        } else if let deLaWeb = progreso.importa(codigoWeb: texto) {
            r = deLaWeb
        } else {
            nav.aviso = ajustes.tr("Ese código no es de la app.", "That code isn't from the app.")
            return
        }
        pegado = ""
        nav.aviso = Avisos.importado(r, ajustes)
    }
}

extension AjustesView {
    /// «V S · 1 h 30 min · 21:00»
    func resumenHorario(_ h: Horario) -> String {
        let letras = ajustes.idioma == .en ? ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] : ["D", "L", "M", "X", "J", "V", "S"]
        let dias = Horario.diasEnOrden.filter(h.dias.contains).map { letras[$0] }.joined(separator: " ")
        return "\(dias) · \(Formato.duracion(h.min)) · \(h.hora)"
    }
}
