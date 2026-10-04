// El perfil compartible y el modo duelo de la web, sin servidor: compartes un
// enlace con tu maratón dentro (el mismo de la web, que abre cualquiera) y el
// enlace de otra persona entra como rival. Con varios, un ranking como el club.
import SwiftUI
import MaratonKit

struct RutaRival: Hashable { let nombre: String }

/// En Progreso: tú contra tus rivales
struct SeccionDuelos: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav
    @State private var anadiendo = false
    @State private var pidiendoNombre = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(ajustes.tr("Duelos", "Duels")).font(.title2.weight(.bold)).foregroundStyle(Tema.tinta)
                Spacer()
                Button { anadiendo = true } label: {
                    Label(ajustes.tr("Añadir rival", "Add rival"), systemImage: "person.badge.plus")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
            }
            if ajustes.rivales.isEmpty {
                Text(ajustes.tr("Compara tu maratón con el de tus amigos: comparte tu perfil y pega aquí el suyo (de esta app o de la web). Es una foto fija: para ponerla al día, pídele un enlace nuevo.",
                                "Compare your marathon with your friends’: share your profile and paste theirs here (from this app or the web). It’s a snapshot: ask for a fresh link to update it."))
                    .font(.subheadline).foregroundStyle(Tema.tinta2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .superficie(radio: Tema.radioL)
            } else if let catalogo {
                Ranking(catalogo: catalogo)
            }
            compartir
        }
        .modifier(AnadeRival(activo: $anadiendo))
        .modifier(PideNombre(titulo: ajustes.tr("¿Con qué nombre te verán?", "What name will they see?"),
                             inicial: ajustes.nombrePerfil, activo: $pidiendoNombre) {
            ajustes.nombrePerfil = $0.trimmingCharacters(in: .whitespacesAndNewlines)
        })
    }

    /// Sin nombre, primero se pide (una vez); con él, el enlace va listo para compartir
    @ViewBuilder private var compartir: some View {
        let nombre = ajustes.nombrePerfil
        if nombre.isEmpty {
            Button { pidiendoNombre = true } label: { etiquetaCompartir }
                .buttonStyle(.borderedProminent)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                ShareLink(item: progreso.perfil(nombre: nombre).enlace,
                          subject: Text(ajustes.tr("Mi maratón Marvel", "My Marvel marathon")),
                          message: Text(ajustes.tr("Así voy en el maratón. Ábrelo o pégalo en «Añadir rival» de la app.",
                                                   "Here’s how my marathon is going. Open it or paste it into “Add rival” in the app."))) {
                    etiquetaCompartir
                }
                .buttonStyle(.borderedProminent)
                Button { pidiendoNombre = true } label: {
                    Text(ajustes.tr("Como «\(nombre)» · Cambiar", "As “\(nombre)” · Change"))
                        .font(.footnote).foregroundStyle(Tema.tinta2)
                }
                .padding(.leading, 4)
            }
        }
    }

    private var etiquetaCompartir: some View {
        Label(ajustes.tr("Compartir mi perfil", "Share my profile"), systemImage: "square.and.arrow.up")
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
    }
}

/// Tú y tus rivales ordenados por títulos vistos; cada rival abre su página
private struct Ranking: View {
    let catalogo: Catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes

    private struct Fila: Identifiable {
        let id: String
        let nombre: String
        let r: Progreso.Resumen
        let yo: Bool
    }

    var body: some View {
        var filas = [Fila(id: "", nombre: ajustes.tr("Tú", "You"), r: progreso.resumen, yo: true)]
        filas += ajustes.rivales.map { Fila(id: $0.n, nombre: $0.n, r: Progreso.ajeno($0, catalogo: catalogo).resumen, yo: false) }
        // a igual cuenta, tú primero: el empate no te baja
        filas.sort { ($0.r.vistos, $0.yo ? 1 : 0) > ($1.r.vistos, $1.yo ? 1 : 0) }
        return VStack(spacing: 0) {
            ForEach(Array(filas.enumerated()), id: \.element.id) { i, f in
                if i > 0 { Divider().overlay(Tema.linea).padding(.leading, 48) }
                if f.yo {
                    fila(f, puesto: i + 1)
                } else {
                    NavigationLink(value: RutaRival(nombre: f.nombre)) { fila(f, puesto: i + 1) }
                        .buttonStyle(.plain)
                        .accessibilityHint(ajustes.tr("Abre su perfil", "Opens their profile"))
                }
            }
        }
        .padding(.vertical, 4)
        .superficie(radio: Tema.radioL)
    }

    private func fila(_ f: Fila, puesto: Int) -> some View {
        HStack(spacing: 12) {
            Text("\(puesto)")
                .font(.subheadline.weight(.heavy).monospacedDigit())
                .foregroundStyle(puesto <= 3 ? .black : Tema.tinta2)
                .frame(width: 28, height: 28)
                .background(Circle().fill(Puesto.color(puesto)))
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(f.nombre).font(.headline).foregroundStyle(f.yo ? Tema.rojo : Tema.tinta).lineLimit(1)
                    Spacer()
                    Text("\(f.r.vistos)/\(f.r.total) · \(Formato.duracion(f.r.minutosVistos))")
                        .font(.caption.weight(.semibold).monospacedDigit()).foregroundStyle(Tema.tinta2)
                }
                Barra(fraccion: f.r.fraccion, color: f.yo ? Tema.rojo : Tema.oro)
            }
            if !f.yo {
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Tema.tinta3)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}

enum Puesto {
    /// Oro, plata y bronce para los tres primeros
    static func color(_ puesto: Int) -> Color {
        switch puesto {
        case 1: Color(red: 0.96, green: 0.76, blue: 0.26)
        case 2: Color(red: 0.78, green: 0.80, blue: 0.84)
        case 3: Color(red: 0.82, green: 0.55, blue: 0.33)
        default: Tema.panel2
        }
    }
}

/// Pegar el enlace (o el código) de otra persona, con un nombre opcional
struct AnadeRival: ViewModifier {
    @Binding var activo: Bool
    var titulo: String? = nil
    /// Poner al día a un rival: su enlace nuevo ocupa su sitio y su nombre
    var reemplaza: String? = nil
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav
    @State private var enlace = ""
    @State private var nombre = ""

    func body(content: Content) -> some View {
        content
            .alert(titulo ?? ajustes.tr("Añadir rival", "Add rival"), isPresented: $activo) {
                TextField(ajustes.tr("Enlace de su perfil", "Their profile link"), text: $enlace)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                if reemplaza == nil {
                    TextField(ajustes.tr("Su nombre (opcional)", "Their name (optional)"), text: $nombre)
                }
                Button(ajustes.tr("Cancelar", "Cancel"), role: .cancel) {}
                Button(ajustes.tr("Añadir", "Add")) { anade() }
                    .disabled(enlace.trimmingCharacters(in: .whitespaces).isEmpty)
            } message: {
                Text(ajustes.tr("El de «Compartir mi perfil», de esta app o de la web.",
                                "The one from “Share my profile”, in this app or on the web."))
            }
            .onChange(of: activo) { _, abierto in if abierto { enlace = ""; nombre = "" } }
    }

    private func anade() {
        guard var p = PerfilCompartido.lee(enlace) else {
            nav.aviso = ajustes.tr("Eso no parece un enlace de perfil: revisa que esté completo.",
                                   "That doesn’t look like a profile link: check that it’s complete.")
            return
        }
        if let reemplaza { return ajustes.reemplazaRival(reemplaza, con: p) }
        let n = nombre.trimmingCharacters(in: .whitespacesAndNewlines)
        if !n.isEmpty { p = p.llamado(n) }
        ajustes.agregaRival(p)
    }
}

/// La página de un rival: su maratón, el duelo contigo, lo que vio y tú no,
/// sus estrellas y sus logros (como PerfilView de la web)
struct RivalView: View {
    let nombre: String
    @Environment(\.catalogo) private var catalogo
    @Environment(\.dismiss) private var cerrar
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav
    @State private var actualizando = false
    @State private var quitando = false

    var body: some View {
        Group {
            if let catalogo, let p = ajustes.rivales.first(where: { $0.n == nombre }) {
                contenido(p, Progreso.ajeno(p, catalogo: catalogo), catalogo)
            } else {
                ContentUnavailableView(ajustes.tr("Ya no está en tus duelos", "No longer in your duels"),
                                       systemImage: "person.slash")
            }
        }
        .background(Tema.fondo)
        .toolbar(.visible, for: .navigationBar)
    }

    private func contenido(_ p: PerfilCompartido, _ el: Progreso, _ catalogo: Catalogo) -> some View {
        let r = el.resumen
        let d = progreso.duelo(contra: el)
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                CabeceraPestana(titulo: p.n, fondo: catalogo.urlFondo(saga: "ucm"), color: Tema.oro, arriba: 112) {
                    Rotulo(texto: ajustes.tr("Perfil compartido · solo lectura", "Shared profile · read-only"), color: .white.opacity(0.8))
                    Text("\(Int((r.fraccion * 100).rounded())) %").font(Tema.marca(56).monospacedDigit())
                    BarraMarca(fraccion: r.fraccion, alto: 9)
                    HStack {
                        Dato(valor: "\(r.vistos)/\(r.total)", texto: ajustes.tr("títulos", "titles"))
                        Spacer()
                        Dato(valor: Formato.duracion(r.minutosVistos), texto: ajustes.tr("vistas", "watched"))
                        Spacer()
                        Dato(valor: "\(el.logros().filter(\.conseguido).count)", texto: ajustes.tr("logros", "achievements"))
                    }
                }
                VStack(alignment: .leading, spacing: 24) {
                    TarjetaDuelo(nombre: p.n, duelo: d)
                    if !d.soloEl.isEmpty {
                        Posters(titulo: ajustes.tr("Ya vio y tú no", "Watched it, you haven’t"),
                                ids: d.soloEl, catalogo: catalogo)
                    }
                    let valoradas = catalogo.titulos.compactMap { t in el.notas[t.id]?.p.map { (t.id, $0) } }
                        .enumerated().sorted { ($1.element.1, $0.offset) < ($0.element.1, $1.offset) }
                        .map(\.element).prefix(12)
                    if !valoradas.isEmpty {
                        Posters(titulo: ajustes.tr("Sus valoraciones", "Their ratings"),
                                ids: valoradas.map(\.0), estrellas: Dictionary(uniqueKeysWithValues: Array(valoradas)),
                                catalogo: catalogo)
                            .ancla("valoraciones")
                    }
                    SeccionLogros(ajenos: el.logros(), titulo: ajustes.tr("Sus logros", "Their achievements"))
                        .padding(.horizontal, 16)
                    if let f = p.fecha {
                        Text(ajustes.tr("Su maratón a fecha de \(f.formatted(.dateTime.day().month(.wide).year().locale(ajustes.locale))): pídele un enlace nuevo para ponerlo al día.",
                                        "Their marathon as of \(f.formatted(.dateTime.day().month(.wide).year().locale(ajustes.locale))): ask for a fresh link to update it."))
                            .font(.footnote).foregroundStyle(Tema.tinta2)
                            .padding(.horizontal, 16)
                    }
                }
                .padding(.vertical, 20)
            }
        }
        .conAnclaDepuracion()
        .ignoresSafeArea(edges: .top)
        // el nombre ya va grande en la cabecera
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Menu {
                Button(ajustes.tr("Poner al día con un enlace nuevo", "Update with a fresh link"), systemImage: "arrow.clockwise") { actualizando = true }
                ShareLink(item: p.enlace) { Label(ajustes.tr("Compartir su perfil", "Share their profile"), systemImage: "square.and.arrow.up") }
                Button(ajustes.tr("Quitar rival", "Remove rival"), systemImage: "person.badge.minus", role: .destructive) { quitando = true }
            } label: {
                Image(systemName: "ellipsis.circle").accessibilityLabel(ajustes.tr("Más", "More"))
            }
        }
        // el enlace nuevo reemplaza a este rival y conserva el nombre de aquí
        .modifier(AnadeRival(activo: $actualizando, titulo: ajustes.tr("Poner al día", "Update"), reemplaza: nombre))
        .confirmationDialog(ajustes.tr("¿Quitar a \(p.n)?", "Remove \(p.n)?"), isPresented: $quitando, titleVisibility: .visible) {
            Button(ajustes.tr("Quitar rival", "Remove rival"), role: .destructive) {
                cerrar()
                ajustes.rivales.removeAll { $0.n == nombre }
            }
        } message: {
            Text(ajustes.tr("Puedes volver a añadirlo con su enlace.", "You can add them again with their link."))
        }
    }
}

/// Las dos barras, quién va delante y cuánto tienen en común
private struct TarjetaDuelo: View {
    let nombre: String
    let duelo: Duelo
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        let d = duelo
        VStack(alignment: .leading, spacing: 14) {
            Rotulo(texto: ajustes.tr("Duelo", "Duel"), punto: Tema.rojo)
            fila(ajustes.tr("Tú", "You"), d.yo, Tema.rojo)
            fila(nombre, d.el, Tema.oro)
            Group {
                if d.diferencia == 0 {
                    Text(ajustes.tr("Empate: van exactamente igual.", "Dead heat: you’re exactly level."))
                } else if d.diferencia > 0 {
                    Negrita(ajustes.tr("Vas **\(d.diferencia) \(d.diferencia == 1 ? "título" : "títulos")** por delante.",
                                    "You’re **\(d.diferencia) \(d.diferencia == 1 ? "title" : "titles")** ahead."))
                } else {
                    Negrita(ajustes.tr("\(nombre) te saca **\(-d.diferencia) \(d.diferencia == -1 ? "título" : "títulos")**: toca acelerar.",
                                    "\(nombre) is **\(-d.diferencia) \(d.diferencia == -1 ? "title" : "titles")** ahead: time to speed up."))
                }
            }
            .font(.subheadline)
            Text(ajustes.tr("\(d.comunes) en común · \(d.soloYo.count) que solo viste tú · \(d.soloEl.count) que solo vio \(nombre)",
                            "\(d.comunes) in common · \(d.soloYo.count) only you watched · \(d.soloEl.count) only \(nombre) watched"))
                .font(.footnote).foregroundStyle(Tema.tinta2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .superficie(radio: Tema.radioL)
        .padding(.horizontal, 16)
    }

    private func fila(_ quien: String, _ r: Progreso.Resumen, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(quien).font(.headline).lineLimit(1)
                Spacer()
                Text("\(r.vistos)/\(r.total) · \(Formato.duracion(r.minutosVistos))")
                    .font(.caption.weight(.semibold).monospacedDigit()).foregroundStyle(Tema.tinta2)
            }
            Barra(fraccion: r.fraccion, color: color)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Un carrusel de pósters que abren su ficha (con sus estrellas si las hay)
private struct Posters: View {
    let titulo: String
    let ids: [String]
    var estrellas: [String: Int] = [:]
    let catalogo: Catalogo
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(titulo).font(.title3.weight(.bold))
                Spacer()
                if estrellas.isEmpty { Text("\(ids.count)").font(.footnote.monospacedDigit()).foregroundStyle(Tema.tinta2) }
            }
            .padding(.horizontal, 16)
            ScrollView(.horizontal) {
                LazyHStack(spacing: 12) {
                    ForEach(ids, id: \.self) { id in
                        if let t = catalogo.titulo(id) {
                            Button { nav.ficha = t } label: {
                                Poster(url: catalogo.urlPoster(id, idioma: ajustes.idioma), ancho: 96)
                                    .overlay(alignment: .bottomLeading) {
                                        if let n = estrellas[id] {
                                            Estrellas(n: n, color: Tema.oroVivo)
                                                .padding(.horizontal, 6).padding(.vertical, 4)
                                                .background(.black.opacity(0.7), in: .capsule)
                                                .padding(6)
                                        }
                                    }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(catalogo.nombre(t, en: ajustes.idioma))
                            .accessibilityValue(estrellas[id].map { ajustes.tr("\($0) estrellas", "\($0) stars") } ?? "")
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
        }
    }
}

/// Un texto con **negrita** en Markdown (Text con un String no lo interpreta)
private struct Negrita: View {
    let texto: String
    init(_ texto: String) { self.texto = texto }
    var body: some View {
        Text((try? AttributedString(markdown: texto)) ?? AttributedString(texto))
    }
}
