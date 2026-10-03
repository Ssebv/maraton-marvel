import SwiftUI
import UIKit
import MaratonKit

struct ProgresoView: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        NavigationStack {
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
                        SeccionLogros().padding(.top, 16).ancla("logros")
                    }
                    .padding(16)
                }
            }
            .conAnclaDepuracion()
            .background(Tema.fondo)
            .ignoresSafeArea(edges: .top)
            .toolbar(.hidden, for: .navigationBar)
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

    private func enlace(_ catalogo: Catalogo) -> URL? {
        let (v, e) = progreso.exporta()
        return Enlace.crea(v: v, e: e)
    }

    private func importa() {
        let texto = pegado.trimmingCharacters(in: .whitespacesAndNewlines)
        let r: (titulos: Int, episodios: Int)
        if let url = URL(string: texto), let (v, e) = Enlace.lee(url) {
            r = progreso.importa(v: v, e: e)
        } else if let deLaWeb = progreso.importa(codigoWeb: texto) {
            r = deLaWeb
        } else {
            nav.aviso = ajustes.tr("Ese código no es de la app.", "That code isn't from the app.")
            return
        }
        pegado = ""
        nav.aviso = ajustes.tr("Progreso importado: \(r.titulos) títulos y \(r.episodios) episodios nuevos.",
                               "Progress imported: \(r.titulos) titles and \(r.episodios) new episodes.")
    }
}
