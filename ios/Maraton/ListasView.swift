// Listas propias, como la pestaña Listas de la web: rutas con su propio
// progreso, aparte del maratón (re-ver con alguien, sesiones temáticas).
// En Progreso van como sección; cada lista abre su página.
import SwiftUI
import MaratonKit

/// Para navegar a una lista por su id (no por su valor: cambia al marcar)
struct RutaLista: Hashable { let id: String }

/// «Tus listas» en Progreso: una tarjeta por lista y «Nueva lista»
struct SeccionListas: View {
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @State private var creando = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(ajustes.tr("Tus listas", "Your lists")).font(.title2.weight(.bold)).foregroundStyle(Tema.tinta)
                Spacer()
                Button { creando = true } label: {
                    Label(ajustes.tr("Nueva lista", "New list"), systemImage: "plus")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
            }
            if progreso.listas.isEmpty {
                // la explicación solo hace falta mientras no hay ninguna
                Text(ajustes.tr("Rutas con su propio progreso, aparte del maratón: para re-ver con alguien o armar sesiones temáticas. Crea una y añádele títulos desde aquí o desde su ficha.",
                                "Custom routes with their own progress, apart from the marathon: for rewatching with someone or themed sessions. Create one and add titles here or from their pages."))
                    .font(.subheadline).foregroundStyle(Tema.tinta2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .superficie(radio: Tema.radioL)
            }
            ForEach(progreso.listas) { l in
                NavigationLink(value: RutaLista(id: l.id)) { TarjetaLista(lista: l) }
                    .buttonStyle(.plain)
            }
        }
        .modifier(PideNombre(titulo: ajustes.tr("Nueva lista", "New list"), activo: $creando) { progreso.creaLista($0) })
    }
}

private struct TarjetaLista: View {
    let lista: Lista
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        let titulos = progreso.titulos(de: lista)
        HStack(spacing: 14) {
            // los tres primeros pósters, abanicados
            ZStack {
                ForEach(Array(titulos.prefix(3).enumerated().reversed()), id: \.element.id) { i, t in
                    Poster(url: catalogo?.urlPoster(t.id, idioma: ajustes.idioma), ancho: 36, radio: Tema.radioS + 2)
                        .shadow(color: .black.opacity(0.25), radius: 3, y: 2)
                        .rotationEffect(.degrees(Double(i) * 7))
                        .offset(x: CGFloat(i) * 9)
                }
                if titulos.isEmpty {
                    RoundedRectangle(cornerRadius: Tema.radioS + 2).fill(Tema.panel2)
                        .frame(width: 36, height: 54)
                        .overlay(Image(systemName: "list.star").foregroundStyle(Tema.tinta3))
                }
            }
            .frame(width: 64, alignment: .leading)
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(lista.nombre).font(.headline).foregroundStyle(Tema.tinta).lineLimit(1)
                    Spacer()
                    Text("\(lista.vistos)/\(titulos.count)").font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(Tema.oro)
                }
                Barra(fraccion: titulos.isEmpty ? 0 : Double(lista.vistos) / Double(titulos.count), color: Tema.oro)
            }
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Tema.tinta3)
        }
        .padding(14)
        .superficie(radio: Tema.radioL)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityHint(ajustes.tr("Abre la lista", "Opens the list"))
    }
}

/// La página de una lista: su avance, buscar para añadir y sus títulos con su casilla
struct ListaView: View {
    let id: String
    @Environment(\.catalogo) private var catalogo
    @Environment(\.dismiss) private var cerrar
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav
    @State private var busca = ""
    @State private var renombrando = false
    @State private var borrando = false

    var body: some View {
        Group {
            if let l = progreso.lista(id) {
                contenido(l)
            } else {
                // borrada (o llegó por un enlace viejo)
                ContentUnavailableView(ajustes.tr("Esta lista ya no existe", "This list no longer exists"), systemImage: "list.star")
            }
        }
        .background(Tema.fondo)
        .toolbar(.visible, for: .navigationBar)
    }

    private func contenido(_ l: Lista) -> some View {
        let titulos = progreso.titulos(de: l)
        return List {
            if busca.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(ajustes.tr("\(l.vistos) / \(titulos.count) vistos en esta lista · aparte del maratón",
                                        "\(l.vistos) / \(titulos.count) watched on this list · apart from the marathon"))
                            .font(.subheadline).foregroundStyle(Tema.tinta2)
                        Barra(fraccion: titulos.isEmpty ? 0 : Double(l.vistos) / Double(titulos.count), color: Tema.oro)
                    }
                    .listRowBackground(Color.clear)
                }
                Section {
                    if titulos.isEmpty {
                        Text(ajustes.tr("La lista está vacía: busca títulos arriba o añádelos desde cualquier ficha.",
                                        "The list is empty: search for titles above or add them from any title page."))
                            .font(.subheadline).foregroundStyle(Tema.tinta2)
                    }
                    ForEach(titulos) { t in
                        FilaLista(titulo: t, lista: l)
                            .swipeActions {
                                Button(ajustes.tr("Quitar", "Remove"), role: .destructive) {
                                    withAnimation { progreso.alternar(t.id, enLista: l.id) }
                                }
                            }
                    }
                }
                .listRowBackground(Tema.panel)
            } else {
                Section(ajustes.tr("Añadir a la lista", "Add to the list")) {
                    let resultados = catalogo?.buscar(busca) { !ajustes.sinSpoilers || progreso.visto($0.id) }.prefix(30) ?? []
                    if resultados.isEmpty {
                        Text(ajustes.tr("Nada coincide", "No matches")).foregroundStyle(Tema.tinta2)
                    }
                    ForEach(Array(resultados)) { t in
                        let dentro = l.items.contains(t.id)
                        Button {
                            withAnimation(.snappy) { progreso.alternar(t.id, enLista: l.id) }
                        } label: {
                            HStack(spacing: 12) {
                                Poster(url: catalogo?.urlPoster(t.id, idioma: ajustes.idioma), ancho: 32, radio: Tema.radioS)
                                Text(catalogo?.nombre(t, en: ajustes.idioma) ?? t.t).foregroundStyle(Tema.tinta)
                                Spacer()
                                Image(systemName: dentro ? "checkmark.circle.fill" : "plus.circle")
                                    .font(.title3)
                                    .foregroundStyle(dentro ? Tema.oro : Tema.tinta3)
                                    .contentTransition(.symbolEffect(.replace))
                            }
                        }
                        .accessibilityValue(dentro ? ajustes.tr("En la lista", "On the list") : "")
                    }
                }
                .listRowBackground(Tema.panel)
            }
        }
        .scrollContentBackground(.hidden)
        .listSectionSpacing(.compact)
        .navigationTitle(l.nombre)
        .searchable(text: $busca, placement: .navigationBarDrawer(displayMode: .always),
                    prompt: ajustes.tr("Buscar títulos para añadir", "Search titles to add"))
        .toolbar {
            Menu {
                Button(ajustes.tr("Renombrar", "Rename"), systemImage: "pencil") { renombrando = true }
                Button(ajustes.tr("Borrar lista", "Delete list"), systemImage: "trash", role: .destructive) { borrando = true }
            } label: {
                Image(systemName: "ellipsis.circle").accessibilityLabel(ajustes.tr("Más", "More"))
            }
        }
        .modifier(PideNombre(titulo: ajustes.tr("Renombrar lista", "Rename list"), inicial: l.nombre, activo: $renombrando) {
            progreso.renombraLista(l.id, a: $0)
        })
        .confirmationDialog(ajustes.tr("¿Borrar «\(l.nombre)»?", "Delete “\(l.nombre)”?"), isPresented: $borrando,
                            titleVisibility: .visible) {
            Button(ajustes.tr("Borrar lista", "Delete list"), role: .destructive) {
                cerrar()
                progreso.borraLista(l.id)
            }
        } message: {
            Text(ajustes.tr("Se pierde lo marcado en ella. El maratón no cambia.",
                            "What you marked on it is lost. The marathon doesn't change."))
        }
    }
}

/// Un título de la lista: la casilla es de la lista; tocarlo abre la ficha
private struct FilaLista: View {
    let titulo: Titulo
    let lista: Lista
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        let vista = lista.vista(titulo.id)
        HStack(spacing: 10) {
            Casilla(marcada: vista, color: Tema.oro) {
                withAnimation(.snappy) { progreso.alternarVista(titulo.id, enLista: lista.id) }
            }
            Button { nav.abre(titulo, desde: "lista:\(titulo.id)") } label: {
                HStack(spacing: 12) {
                    Poster(url: catalogo?.urlPoster(titulo.id, idioma: ajustes.idioma), ancho: 40, radio: Tema.radioS + 2)
                        .origenZoom("lista:\(titulo.id)", radio: Tema.radioS + 2)
                        .opacity(vista ? 0.6 : 1)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(catalogo?.nombre(titulo, en: ajustes.idioma) ?? titulo.t)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(vista ? Tema.tinta2 : Tema.tinta)
                        if let catalogo {
                            Text(Formato.meta(titulo, catalogo: catalogo)).font(.caption).foregroundStyle(Tema.tinta2)
                        }
                        // ya visto en el maratón: útil al re-ver con alguien
                        if progreso.visto(titulo.id) { Etiqueta(texto: ajustes.tr("Visto en el maratón", "Seen in the marathon")) }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .menuTitulo(titulo)
        }
        .padding(.leading, -8)
    }
}

/// Alerta con un campo de texto para el nombre de una lista
struct PideNombre: ViewModifier {
    let titulo: String
    var inicial = ""
    @Binding var activo: Bool
    let listo: (String) -> Void
    @Environment(Ajustes.self) private var ajustes
    @State private var nombre = ""

    func body(content: Content) -> some View {
        content
            .alert(titulo, isPresented: $activo) {
                TextField(ajustes.tr("Nombre", "Name"), text: $nombre)
                Button(ajustes.tr("Cancelar", "Cancel"), role: .cancel) {}
                Button(ajustes.tr("Guardar", "Save")) { listo(nombre) }
                    .disabled(nombre.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .onChange(of: activo) { _, abierto in if abierto { nombre = inicial } }
    }
}
